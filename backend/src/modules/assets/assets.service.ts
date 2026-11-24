import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AssetType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { CreateAssetMaintenanceDto } from "./dto/create-asset-maintenance.dto";
import { UpdateAssetAssignmentDto } from "./dto/update-asset-assignment.dto";

const ASSET_PREFIX: Record<AssetType, string> = {
  [AssetType.PRINTER]: "PRN",
  [AssetType.SCANNER]: "SCN",
  [AssetType.PC]: "PC",
  [AssetType.MONITOR]: "MON",
  [AssetType.OTHER]: "OTH",
};

const ASSET_SEARCH_LIMIT = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const fileMetadataSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  createdAt: true,
} as const;

type UploadedAssetFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [branches, employees] = await this.prisma.$transaction([
      this.prisma.branch.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      this.prisma.assetEmployee.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
    ]);
    return { branches, employees };
  }

  async list(search?: string) {
    const query = search?.trim();
    const where: Prisma.TrackedAssetWhereInput = query
      ? {
          OR: [
            { assetCode: { contains: query, mode: "insensitive" } },
            { modelName: { contains: query, mode: "insensitive" } },
            { serialNumber: { contains: query, mode: "insensitive" } },
            { manufacturerSerialNumber: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
            { branch: { contains: query, mode: "insensitive" } },
            { department: { contains: query, mode: "insensitive" } },
            { employee: { is: { name: { contains: query, mode: "insensitive" } } } },
            { employee: { is: { email: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.trackedAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { assetCode: "asc" }],
        take: ASSET_SEARCH_LIMIT,
        select: {
          id: true,
          assetCode: true,
          type: true,
          modelName: true,
          serialNumber: true,
          manufacturerSerialNumber: true,
          location: true,
          branch: true,
          department: true,
          employee: { select: { id: true, name: true, email: true } },
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.trackedAsset.count({ where }),
    ]);

    return { data, total };
  }

  async create(actor: AuthenticatedUser, dto: CreateAssetDto) {
    const modelName = dto.modelName.trim();
    const branch = dto.branch.trim();
    const department = dto.department?.trim() || null;
    if (!modelName || !branch) {
      throw new BadRequestException("Model and branch are required");
    }
    await this.requireBranch(branch);

    return this.prisma.$transaction(async (transaction) => {
      const counter = await transaction.assetCodeCounter.upsert({
        where: { type: dto.type },
        create: { type: dto.type, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const assetCode = `${ASSET_PREFIX[dto.type]}-${String(counter.lastNumber).padStart(6, "0")}`;
      const employee = await this.resolveEmployee(transaction, dto);

      return transaction.trackedAsset.create({
        data: {
          assetCode,
          type: dto.type,
          modelName,
          serialNumber: assetCode,
          location: branch,
          branch,
          department,
          employeeId: employee?.id,
          createdById: actor.id,
          createdByName: actor.fullName,
          locationHistory: {
            create: {
              toLocation: branch,
              toDepartment: department,
              toEmployeeName: employee?.name,
              toEmployeeEmail: employee?.email,
              changedById: actor.id,
              changedByName: actor.fullName,
            },
          },
        },
        include: this.detailInclude,
      });
    });
  }

  async detail(id: string) {
    const asset = await this.prisma.trackedAsset.findUnique({
      where: { id },
      include: this.detailInclude,
    });
    if (!asset) throw new NotFoundException("Asset not found");
    return asset;
  }

  async updateAssignment(id: string, actor: AuthenticatedUser, dto: UpdateAssetAssignmentDto) {
    const branch = dto.branch.trim();
    const department = dto.department?.trim() || null;
    if (!branch) throw new BadRequestException("Branch is required");
    await this.requireBranch(branch);

    return this.prisma.$transaction(async (transaction) => {
      const asset = await transaction.trackedAsset.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!asset) throw new NotFoundException("Asset not found");
      const employee = await this.resolveEmployee(transaction, dto);
      if (
        asset.branch === branch &&
        asset.department === department &&
        asset.employeeId === (employee?.id ?? null)
      ) {
        throw new BadRequestException("The asset assignment has not changed");
      }

      await transaction.trackedAsset.update({
        where: { id },
        data: { location: branch, branch, department, employeeId: employee?.id ?? null },
      });
      await transaction.assetLocationHistory.create({
        data: {
          assetId: id,
          fromLocation: asset.branch ?? asset.location,
          toLocation: branch,
          fromDepartment: asset.department,
          toDepartment: department,
          fromEmployeeName: asset.employee?.name,
          fromEmployeeEmail: asset.employee?.email,
          toEmployeeName: employee?.name,
          toEmployeeEmail: employee?.email,
          changedById: actor.id,
          changedByName: actor.fullName,
        },
      });
      return transaction.trackedAsset.findUniqueOrThrow({
        where: { id },
        include: this.detailInclude,
      });
    });
  }

  async addMaintenance(
    id: string,
    actor: AuthenticatedUser,
    dto: CreateAssetMaintenanceDto,
    files: UploadedAssetFile[],
  ) {
    const asset = await this.prisma.trackedAsset.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException("Asset not found");
    if (!dto.summary.trim()) throw new BadRequestException("Maintenance summary is required");

    const invoices = files.map((file) => {
      this.validateInvoice(file);
      return {
        fileName: this.safeFileName(file.originalname),
        fileData: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        mimeType: file.mimetype,
        fileSize: file.size,
      };
    });

    return this.prisma.assetMaintenance.create({
      data: {
        assetId: id,
        maintenanceDate: dto.maintenanceDate ? new Date(dto.maintenanceDate) : new Date(),
        summary: dto.summary.trim(),
        details: dto.details?.trim() || null,
        createdById: actor.id,
        createdByName: actor.fullName,
        invoices: { create: invoices },
      },
      include: { invoices: { select: fileMetadataSelect } },
    });
  }

  async addPhoto(
    id: string,
    actor: AuthenticatedUser,
    file: UploadedAssetFile,
    caption?: string,
  ) {
    const asset = await this.prisma.trackedAsset.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!asset) throw new NotFoundException("Asset not found");
    this.validatePhoto(file);

    return this.prisma.assetPhoto.create({
      data: {
        assetId: id,
        fileName: this.safeFileName(file.originalname),
        fileData: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        mimeType: file.mimetype,
        fileSize: file.size,
        caption: caption?.trim().slice(0, 300) || null,
        location: asset.branch ?? asset.location,
        department: asset.department,
        employeeName: asset.employee?.name,
        employeeEmail: asset.employee?.email,
        uploadedByName: actor.fullName,
      },
      select: {
        ...fileMetadataSelect,
        assetId: true,
        caption: true,
        location: true,
        department: true,
        employeeName: true,
        employeeEmail: true,
        uploadedByName: true,
      },
    });
  }

  async maintenanceTimeline(search?: string) {
    const where = this.assetSearchWhere(search);
    return this.prisma.trackedAsset.findMany({
      where,
      orderBy: [{ assetCode: "asc" }],
      take: ASSET_SEARCH_LIMIT,
      include: {
        employee: { select: { id: true, name: true, email: true } },
        maintenance: {
          orderBy: { maintenanceDate: "desc" },
          take: 2,
          include: { invoices: { select: fileMetadataSelect } },
        },
        locationHistory: { orderBy: { changedAt: "desc" }, take: 2 },
      },
    });
  }

  async report() {
    const [assets, maintenanceRecords] = await this.prisma.$transaction([
      this.prisma.trackedAsset.findMany({
        orderBy: { assetCode: "asc" },
        select: {
          id: true,
          assetCode: true,
          type: true,
          modelName: true,
          location: true,
          branch: true,
        },
      }),
      this.prisma.assetMaintenance.findMany({
        orderBy: { maintenanceDate: "desc" },
        select: {
          assetId: true,
          summary: true,
          maintenanceDate: true,
        },
      }),
    ]);

    const maintenanceByAsset = new Map<string, number>();
    const issues = new Map<string, { summary: string; count: number; assetIds: Set<string> }>();
    const latestMaintenanceByAsset = new Map<string, Date>();

    for (const record of maintenanceRecords) {
      maintenanceByAsset.set(record.assetId, (maintenanceByAsset.get(record.assetId) ?? 0) + 1);
      if (!latestMaintenanceByAsset.has(record.assetId)) {
        latestMaintenanceByAsset.set(record.assetId, record.maintenanceDate);
      }

      const normalizedSummary = record.summary.trim().toLocaleLowerCase().replace(/\s+/g, " ");
      if (!normalizedSummary) continue;
      const issue = issues.get(normalizedSummary) ?? {
        summary: record.summary.trim(),
        count: 0,
        assetIds: new Set<string>(),
      };
      issue.count += 1;
      issue.assetIds.add(record.assetId);
      issues.set(normalizedSummary, issue);
    }

    const assetsWithMaintenance = assets.filter((asset) => maintenanceByAsset.has(asset.id)).length;
    const frequentMaintenanceThreshold = 3;
    const frequentAssets = assets
      .map((asset) => ({
        ...asset,
        maintenanceCount: maintenanceByAsset.get(asset.id) ?? 0,
        lastMaintenanceDate: latestMaintenanceByAsset.get(asset.id)?.toISOString() ?? null,
      }))
      .filter((asset) => asset.maintenanceCount >= frequentMaintenanceThreshold)
      .sort((left, right) => right.maintenanceCount - left.maintenanceCount || left.assetCode.localeCompare(right.assetCode));

    return {
      totalAssets: assets.length,
      assetsWithMaintenance,
      assetsWithoutMaintenance: assets.length - assetsWithMaintenance,
      totalMaintenanceRecords: maintenanceRecords.length,
      frequentMaintenanceThreshold,
      frequentMaintenanceAssets: frequentAssets,
      recurringIssues: Array.from(issues.values())
        .map(({ assetIds, ...issue }) => ({ ...issue, assetCount: assetIds.size }))
        .sort((left, right) => right.count - left.count || left.summary.localeCompare(right.summary))
        .slice(0, 10),
    };
  }

  async photo(assetId: string, photoId: string) {
    const photo = await this.prisma.assetPhoto.findFirst({
      where: { id: photoId, assetId },
      select: { fileName: true, fileData: true, mimeType: true },
    });
    if (!photo) throw new NotFoundException("Asset photo not found");
    return { fileName: photo.fileName, fileUrl: photo.fileData, mimeType: photo.mimeType };
  }

  async invoice(assetId: string, maintenanceId: string, invoiceId: string) {
    const invoice = await this.prisma.assetMaintenanceInvoice.findFirst({
      where: { id: invoiceId, maintenanceId, maintenance: { assetId } },
      select: { fileName: true, fileData: true, mimeType: true },
    });
    if (!invoice) throw new NotFoundException("Maintenance invoice not found");
    return { fileName: invoice.fileName, fileUrl: invoice.fileData, mimeType: invoice.mimeType };
  }

  private assetSearchWhere(search?: string): Prisma.TrackedAssetWhereInput {
    const query = search?.trim();
    if (!query) return {};
    return {
      OR: [
        { assetCode: { contains: query, mode: "insensitive" } },
        { modelName: { contains: query, mode: "insensitive" } },
        { serialNumber: { contains: query, mode: "insensitive" } },
        { manufacturerSerialNumber: { contains: query, mode: "insensitive" } },
        { location: { contains: query, mode: "insensitive" } },
        { branch: { contains: query, mode: "insensitive" } },
        { department: { contains: query, mode: "insensitive" } },
        { employee: { is: { name: { contains: query, mode: "insensitive" } } } },
        { employee: { is: { email: { contains: query, mode: "insensitive" } } } },
      ],
    };
  }

  private readonly detailInclude = {
    employee: { select: { id: true, name: true, email: true } },
    locationHistory: { orderBy: { changedAt: "desc" as const } },
    maintenance: {
      orderBy: { maintenanceDate: "desc" as const },
      include: {
        invoices: {
          select: fileMetadataSelect,
          orderBy: { createdAt: "desc" as const },
        },
      },
    },
    photos: {
      select: {
        ...fileMetadataSelect,
        assetId: true,
        caption: true,
        location: true,
        department: true,
        employeeName: true,
        employeeEmail: true,
        uploadedByName: true,
      },
      orderBy: { createdAt: "desc" as const },
    },
  } satisfies Prisma.TrackedAssetInclude;

  private async requireBranch(branch: string) {
    const exists = await this.prisma.branch.findUnique({
      where: { name: branch },
      select: { name: true },
    });
    if (!exists) throw new BadRequestException("Select a branch registered in the system");
  }

  private async resolveEmployee(
    transaction: Prisma.TransactionClient,
    input: { employeeId?: string; employeeName?: string; employeeEmail?: string },
  ) {
    if (input.employeeId) {
      const employee = await transaction.assetEmployee.findUnique({ where: { id: input.employeeId } });
      if (!employee) throw new NotFoundException("Asset employee not found");
      return employee;
    }

    const name = input.employeeName?.trim();
    const email = input.employeeEmail?.trim().toLowerCase();
    if (!name && !email) return null;
    if (!name || !email) {
      throw new BadRequestException("Both employee name and email are required");
    }
    return transaction.assetEmployee.upsert({
      where: { email },
      create: { name, email },
      update: { email },
    });
  }

  private validateInvoice(file: UploadedAssetFile) {
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException("Each invoice must be between 1 byte and 10 MB");
    }
    const signature = file.buffer.subarray(0, 8);
    const valid =
      (file.mimetype === "application/pdf" && signature.subarray(0, 5).toString("ascii") === "%PDF-") ||
      (file.mimetype === "image/png" && signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === "image/jpeg" && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff);
    if (!valid) throw new BadRequestException("Only valid PDF, PNG, or JPEG invoices are accepted");
  }

  private validatePhoto(file: UploadedAssetFile) {
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException("A photo must be between 1 byte and 10 MB");
    }
    const signature = file.buffer.subarray(0, 8);
    const valid =
      (file.mimetype === "image/png" && signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === "image/jpeg" && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff);
    if (!valid) throw new BadRequestException("Only valid PNG or JPEG photos are accepted");
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^\w .()-]/g, "_").slice(0, 180) || "attachment";
  }
}
