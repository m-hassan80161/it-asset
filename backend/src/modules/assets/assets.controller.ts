import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { CreateAssetMaintenanceDto } from "./dto/create-asset-maintenance.dto";
import { UpdateAssetAssignmentDto } from "./dto/update-asset-assignment.dto";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("assets")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  list(@Query("search") search?: string) {
    return this.assetsService.list(search);
  }

  @Get("maintenance")
  maintenanceTimeline(@Query("search") search?: string) {
    return this.assetsService.maintenanceTimeline(search);
  }

  @Get("report")
  report() {
    return this.assetsService.report();
  }

  @Get("options")
  options() {
    return this.assetsService.options();
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAssetDto,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.assetsService.create(request.user, dto);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.assetsService.detail(id);
  }

  @Patch(":id/location")
  updateLocation(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAssetAssignmentDto,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.assetsService.updateAssignment(id, request.user, dto);
  }

  @Post(":id/maintenance")
  @UseInterceptors(FilesInterceptor("files", 5, {
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (_request, file, callback) => {
      if (!["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype)) {
        callback(new BadRequestException("Only PDF, PNG, and JPEG invoices are accepted"), false);
        return;
      }
      callback(null, true);
    },
  }))
  addMaintenance(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CreateAssetMaintenanceDto,
    @UploadedFiles()
    files: Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }> = [],
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.assetsService.addMaintenance(id, request.user, dto, files);
  }

  @Post(":id/photos")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!["image/png", "image/jpeg"].includes(file.mimetype)) {
        callback(new BadRequestException("Only PNG and JPEG photos are accepted"), false);
        return;
      }
      callback(null, true);
    },
  }))
  addPhoto(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body("caption") caption: string | undefined,
    @UploadedFile()
    file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    if (!file) throw new BadRequestException("A photo file is required");
    return this.assetsService.addPhoto(id, request.user, file, caption);
  }

  @Get(":id/photos/:photoId")
  photo(@Param("id") id: string, @Param("photoId") photoId: string) {
    return this.assetsService.photo(id, photoId);
  }

  @Get(":id/maintenance/:maintenanceId/invoices/:invoiceId")
  invoice(
    @Param("id") id: string,
    @Param("maintenanceId") maintenanceId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    return this.assetsService.invoice(id, maintenanceId, invoiceId);
  }
}
