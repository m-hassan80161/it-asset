import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  TicketPriority,
  TicketStatus,
  UserRole,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { LogsService } from "../logs/logs.service";
import { AssignTicketDto } from "./dto/assign-ticket.dto";
import { CommentDto } from "./dto/comment.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { TicketQueryDto } from "./dto/ticket-query.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { RequestTransferDto } from "./dto/request-transfer.dto";

const ticketInclude = {
  requester: { select: { id: true, username: true, fullName: true } },
  assignedAdmin: { select: { id: true, username: true, fullName: true } },
  manager: { select: { id: true, username: true, fullName: true } },
  attachments: {
    select: { id: true, fileName: true, fileSize: true, createdAt: true },
  },
  comments: {
    include: {
      author: { select: { id: true, username: true, fullName: true, role: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TicketInclude;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  async createTicket(actor: AuthenticatedUser, dto: CreateTicketDto) {
    const branch = this.resolveCreateBranch(actor, dto.branch);
    if (Boolean(dto.remoteSupportType) !== Boolean(dto.remoteSupportId?.trim())) {
      throw new BadRequestException("Choose a remote support type and provide its ID together");
    }
    const manager = await this.prisma.adminAccount.findFirst({
      where: { role: UserRole.MANAGER, isActive: true, managedBranches: { has: branch } },
      select: { id: true },
    });
    const ticket = await this.prisma.ticket.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        priority: dto.priority,
        requesterId: actor.id,
        requesterUsername: actor.username,
        requesterName: actor.fullName,
        branch,
        departmentId: dto.departmentId?.trim(),
        remoteSupportType: dto.remoteSupportType,
        remoteSupportId: dto.remoteSupportId?.trim(),
        managerId: manager?.id,
      },
      include: ticketInclude,
    });
    await this.recordOperation(actor, "Ticket created", {
      ticketId: ticket.id,
      category: ticket.category,
      branch: ticket.branch,
    });
    return ticket;
  }

  async listTickets(actor: AuthenticatedUser, query: TicketQueryDto) {
    if (
      query.branch &&
      actor.role === UserRole.MANAGER &&
      !actor.managedBranches.includes(query.branch)
    ) {
      throw new ForbiddenException("Branch is outside your managed branches");
    }
    const where = this.withFilters(this.scopeWhere(actor), query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: this.sortOrder(query),
        include: ticketInclude,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data, total, skip: query.skip, take: query.take };
  }

  async getTicket(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    this.assertCanAccessTicket(actor, ticket);
    return ticket;
  }

  async listBranchTickets(
    actor: AuthenticatedUser,
    branch: string,
    query: TicketQueryDto,
  ) {
    this.assertCanAccessBranch(actor, branch);
    const scope = actor.role === UserRole.ADMIN
      ? this.scopeWhere(actor)
      : { branch };
    const where = this.withFilters(scope, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: this.sortOrder(query),
        include: ticketInclude,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data, total, skip: query.skip, take: query.take };
  }

  async getAdminDashboard(actor: AuthenticatedUser) {
    const branch = actor.role === UserRole.SUPER_ADMIN
      ? undefined
      : actor.branch;
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Admin access required");
    }
    if (actor.role === UserRole.ADMIN && !branch) {
      throw new ForbiddenException("Admin account has no assigned branch");
    }
    const where: Prisma.TicketWhereInput = branch
      ? { OR: [{ branch }, { assignedAdminId: actor.id }] }
      : actor.role === UserRole.SUPER_ADMIN
        ? {}
        : { branch: { in: actor.managedBranches } };
    const [open, inProgress, waitingUser, high, urgent] = await Promise.all([
      this.prisma.ticket.count({ where: { ...where, status: TicketStatus.OPEN } }),
      this.prisma.ticket.count({ where: { ...where, status: TicketStatus.IN_PROGRESS } }),
      this.prisma.ticket.count({ where: { ...where, status: TicketStatus.WAITING_USER } }),
      this.prisma.ticket.count({ where: { ...where, priority: TicketPriority.HIGH } }),
      this.prisma.ticket.count({ where: { ...where, priority: TicketPriority.URGENT } }),
    ]);
    return { branch, open, inProgress, waitingUser, high, urgent };
  }

  async updateTicket(actor: AuthenticatedUser, ticketId: string, dto: UpdateTicketDto) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    const remoteSupportType =
      dto.remoteSupportType === undefined ? ticket.remoteSupportType : dto.remoteSupportType;
    const remoteSupportId =
      dto.remoteSupportId === undefined ? ticket.remoteSupportId : dto.remoteSupportId?.trim();
    if (Boolean(remoteSupportType) !== Boolean(remoteSupportId)) {
      throw new BadRequestException("Choose a remote support type and provide its ID together");
    }
    const isRequester = actor.role === UserRole.EMPLOYEE && ticket.requesterId === actor.id;
    if (isRequester) {
      if (ticket.status !== TicketStatus.OPEN) {
        throw new ForbiddenException("Only open tickets can be edited by their requester");
      }
      if (dto.status || dto.priority) {
        throw new ForbiddenException("Only support staff can change ticket status or priority");
      }
    } else {
      this.assertCanManageTicket(actor, ticket);
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        category: dto.category,
        remoteSupportType: dto.remoteSupportType,
        remoteSupportId: dto.remoteSupportId?.trim(),
        priority: dto.priority,
        status: dto.status,
        resolvedAt:
          dto.status === TicketStatus.RESOLVED
            ? new Date()
            : dto.status
              ? null
              : undefined,
      },
      include: ticketInclude,
    });
    await this.recordOperation(actor, "Ticket updated", {
      ticketId,
      status: updated.status,
    });
    return updated;
  }

  async closeTicket(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    if (
      actor.role === UserRole.EMPLOYEE &&
      (ticket.requesterId !== actor.id || ticket.status !== TicketStatus.RESOLVED)
    ) {
      throw new ForbiddenException("Only the requester can confirm and close a resolved ticket");
    }
    if (actor.role !== UserRole.EMPLOYEE) {
      this.assertCanManageTicket(actor, ticket);
    }
    const closed = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.CLOSED },
      include: ticketInclude,
    });
    await this.recordOperation(actor, "Ticket closed", { ticketId });
    return closed;
  }

  async assignTicket(
    actor: AuthenticatedUser,
    ticketId: string,
    dto: AssignTicketDto,
  ) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanManageTicket(actor, ticket);
    const assignee = await this.prisma.adminAccount.findUnique({
      where: { id: dto.assignedAdminId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        branch: true,
        isActive: true,
      },
    });
    if (
      !assignee ||
      assignee.role !== UserRole.ADMIN ||
      (actor.role !== UserRole.SUPER_ADMIN && assignee.branch !== ticket.branch) ||
      !assignee.isActive
    ) {
      throw new BadRequestException(
        actor.role === UserRole.SUPER_ADMIN
          ? "Assignee must be an active admin"
          : "Assignee must be an active admin for this ticket's branch",
      );
    }
    if (actor.role === UserRole.ADMIN && assignee.id !== actor.id) {
      throw new ForbiddenException("Branch admins can claim tickets or request a transfer");
    }
    const assigned = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedAdminId: assignee.id,
        assignedAdminName: assignee.fullName,
        assignedAdminUsername: assignee.username,
        status: ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : undefined,
      },
      include: ticketInclude,
    });
    await this.recordOperation(actor, "Ticket assigned", {
      ticketId,
      previousAssignedAdminId: ticket.assignedAdminId,
      assignedAdminId: assignee.id,
      branch: ticket.branch,
    });
    return assigned;
  }

  async getTransferTargets(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only branch admins can request ticket transfers");
    }
    return this.prisma.adminAccount.findMany({
      where: { role: UserRole.ADMIN, isActive: true, id: { not: actor.id } },
      select: { id: true, username: true, fullName: true, branch: true },
      orderBy: [{ branch: "asc" }, { fullName: "asc" }],
    });
  }

  async getTransferInbox(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only branch admins can view transfer requests");
    }
    return this.prisma.ticketTransferRequest.findMany({
      where: { targetAdminId: actor.id, status: "PENDING" },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            description: true,
            branch: true,
            status: true,
            priority: true,
            assignedAdminId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async requestTransfer(
    actor: AuthenticatedUser,
    ticketId: string,
    dto: RequestTransferDto,
  ) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only branch admins can request ticket transfers");
    }
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    if (!ticket.assignedAdminId) {
      throw new BadRequestException("Only assigned tickets can be transferred");
    }
    const target = await this.prisma.adminAccount.findUnique({
      where: { id: dto.targetAdminId },
      select: { id: true, username: true, fullName: true, role: true, branch: true, isActive: true },
    });
    if (!target || target.role !== UserRole.ADMIN || !target.isActive) {
      throw new BadRequestException("Transfer recipient must be an active admin");
    }
    if (target.id === actor.id || target.id === ticket.assignedAdminId) {
      throw new BadRequestException("Choose a different admin as transfer recipient");
    }
    const pending = await this.prisma.ticketTransferRequest.findFirst({
      where: { ticketId, targetAdminId: target.id, status: "PENDING" },
    });
    if (pending) throw new ConflictException("A transfer request is already pending");

    const request = await this.prisma.ticketTransferRequest.create({
      data: {
        ticketId,
        requestedByAdminId: actor.id,
        requesterName: actor.fullName,
        requesterUsername: actor.username,
        targetAdminId: target.id,
        targetName: target.fullName,
        targetUsername: target.username,
        message: dto.message?.trim(),
      },
    });
    await this.recordOperation(actor, "Ticket transfer requested", {
      ticketId,
      transferRequestId: request.id,
      fromAdminId: ticket.assignedAdminId,
      requestedByAdminId: actor.id,
      targetAdminId: target.id,
      branch: ticket.branch,
    });
    return request;
  }

  async respondToTransfer(
    actor: AuthenticatedUser,
    requestId: string,
    approve: boolean,
  ) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only the receiving admin can respond");
    }
    const transfer = await this.prisma.ticketTransferRequest.findUnique({
      where: { id: requestId },
      include: { ticket: true },
    });
    if (!transfer) throw new NotFoundException("Transfer request not found");
    if (transfer.targetAdminId !== actor.id) {
      throw new ForbiddenException("This transfer request is for another admin");
    }
    if (transfer.status !== "PENDING") {
      throw new ConflictException("Transfer request has already been answered");
    }
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.ticketTransferRequest.updateMany({
        where: { id: requestId, targetAdminId: actor.id, status: "PENDING" },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          respondedAt: new Date(),
        },
      });
      if (!changed.count) throw new ConflictException("Transfer request has already been answered");
      if (approve) {
        await transaction.ticket.update({
          where: { id: transfer.ticketId },
          data: {
            assignedAdminId: actor.id,
            assignedAdminName: actor.fullName,
            assignedAdminUsername: actor.username,
            status:
              transfer.ticket.status === TicketStatus.OPEN
                ? TicketStatus.IN_PROGRESS
                : undefined,
          },
        });
      }
      await transaction.applicationLog.create({
        data: {
          level: "INFO",
          source: "BACKEND",
          userId: actor.id,
          message: approve ? "Ticket transfer approved" : "Ticket transfer rejected",
          details: {
            ticketId: transfer.ticketId,
            transferRequestId: requestId,
            requestedByAdminId: transfer.requestedByAdminId,
            targetAdminId: actor.id,
            branch: transfer.ticket.branch,
          },
        },
      });
    });
    return { id: requestId, status: approve ? "APPROVED" : "REJECTED" };
  }

  async addComment(actor: AuthenticatedUser, ticketId: string, dto: CommentDto) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: actor.id,
        authorUsername: actor.username,
        authorName: actor.fullName,
        content: dto.content.trim(),
      },
      include: {
        author: { select: { id: true, username: true, fullName: true, role: true } },
      },
    });
    await this.recordOperation(actor, "Ticket comment added", { ticketId });
    return comment;
  }

  async addAttachment(
    actor: AuthenticatedUser,
    ticketId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    if (actor.role !== UserRole.EMPLOYEE) this.assertCanManageTicket(actor, ticket);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Attachment must be between 1 byte and 5 MB");
    }
    const signature = file.buffer.subarray(0, 8);
    const isPdf = file.mimetype === "application/pdf" &&
      signature.subarray(0, 5).toString("ascii") === "%PDF-";
    const isPng = file.mimetype === "image/png" &&
      signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = file.mimetype === "image/jpeg" &&
      signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (!isPdf && !isPng && !isJpeg) {
      throw new BadRequestException("Only valid PDF, PNG, or JPEG attachments are accepted");
    }
    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        ticketId,
        fileName: file.originalname.replace(/[^\w .()-]/g, "_").slice(0, 180) || "attachment",
        fileUrl: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        fileSize: file.size,
      },
      select: { id: true, ticketId: true, fileName: true, fileSize: true, createdAt: true },
    });
    await this.recordOperation(actor, "Ticket attachment uploaded", {
      ticketId,
      attachmentId: attachment.id,
      fileSize: file.size,
    });
    return attachment;
  }

  async getAttachment(
    actor: AuthenticatedUser,
    ticketId: string,
    attachmentId: string,
  ) {
    const ticket = await this.requireTicket(ticketId);
    this.assertCanAccessTicket(actor, ticket);
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, ticketId },
      select: { fileName: true, fileUrl: true },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    return attachment;
  }

  async getManagerDashboard(actor: AuthenticatedUser) {
    this.assertManager(actor);
    const where = this.managerTicketWhere(actor);
    const branches = actor.role === UserRole.SUPER_ADMIN ? undefined : actor.managedBranches;
    const [
      total,
      open,
      inProgress,
      waitingUser,
      resolved,
      closed,
      highPriority,
      urgentPriority,
      byBranch,
      admins,
      solvedTickets,
    ] =
      await Promise.all([
        this.prisma.ticket.count({ where }),
        this.prisma.ticket.count({ where: { ...where, status: TicketStatus.OPEN } }),
        this.prisma.ticket.count({ where: { ...where, status: TicketStatus.IN_PROGRESS } }),
        this.prisma.ticket.count({ where: { ...where, status: TicketStatus.WAITING_USER } }),
        this.prisma.ticket.count({ where: { ...where, status: TicketStatus.RESOLVED } }),
        this.prisma.ticket.count({ where: { ...where, status: TicketStatus.CLOSED } }),
        this.prisma.ticket.count({
          where: { ...where, priority: TicketPriority.HIGH },
        }),
        this.prisma.ticket.count({
          where: { ...where, priority: TicketPriority.URGENT },
        }),
        this.prisma.ticket.groupBy({
          by: ["branch"],
          where,
          _count: { _all: true },
          orderBy: { branch: "asc" },
        }),
        this.prisma.adminAccount.findMany({
          where: {
            role: UserRole.ADMIN,
            isActive: true,
            ...(branches ? { branch: { in: branches } } : {}),
          },
          select: { id: true, username: true, fullName: true, branch: true },
          orderBy: [{ branch: "asc" }, { fullName: "asc" }],
        }),
        this.prisma.ticket.findMany({
          where: { ...where, resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true, assignedAdminId: true },
        }),
      ]);
    const averageResolutionMinutes = solvedTickets.length
      ? Math.round(
          solvedTickets.reduce(
            (sum, ticket) => sum + (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()) / 60000,
            0,
          ) / solvedTickets.length,
        )
      : null;
    const adminPerformance = admins.map((admin) => {
      const resolvedForAdmin = solvedTickets.filter(
        (ticket) => ticket.assignedAdminId === admin.id,
      );
      const averageResolutionMinutes = resolvedForAdmin.length
        ? Math.round(
            resolvedForAdmin.reduce(
              (sum, ticket) =>
                sum + (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()) / 60000,
              0,
            ) / resolvedForAdmin.length,
          )
        : null;
      return {
        ...admin,
        resolvedTickets: resolvedForAdmin.length,
        averageResolutionMinutes,
      };
    });
    return {
      total,
      open,
      inProgress,
      waitingUser,
      resolved,
      closed,
      highPriority,
      urgentPriority: urgentPriority,
      adminCount: admins.length,
      averageResolutionMinutes,
      byBranch: byBranch.map(({ branch, _count }) => ({
        branch,
        total: _count._all,
      })),
      admins: adminPerformance,
    };
  }

  async getManagerStats(actor: AuthenticatedUser) {
    this.assertManager(actor);
    const rows = await this.prisma.ticket.groupBy({
      by: ["branch", "status"],
      where: this.managerTicketWhere(actor),
      _count: { _all: true },
      orderBy: [{ branch: "asc" }, { status: "asc" }],
    });
    return rows.map(({ branch, status, _count }) => ({
      branch,
      status,
      count: _count._all,
    }));
  }

  private async requireTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  private scopeWhere(actor: AuthenticatedUser): Prisma.TicketWhereInput {
    switch (actor.role) {
      case UserRole.SUPER_ADMIN:
        return {};
      case UserRole.MANAGER:
        return { branch: { in: actor.managedBranches } };
      case UserRole.ADMIN:
        if (!actor.branch) throw new ForbiddenException("Admin account has no assigned branch");
        return {
          OR: [
            { branch: actor.branch },
            { assignedAdminId: actor.id },
          ],
        };
      case UserRole.EMPLOYEE:
        return { requesterId: actor.id };
    }
  }

  private managerTicketWhere(actor: AuthenticatedUser): Prisma.TicketWhereInput {
    if (actor.role === UserRole.SUPER_ADMIN) return {};
    return { branch: { in: actor.managedBranches } };
  }

  private withFilters(
    scope: Prisma.TicketWhereInput,
    query: TicketQueryDto,
  ): Prisma.TicketWhereInput {
    const filters: Prisma.TicketWhereInput = {
      ...(query.branch ? { branch: query.branch } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    return {
      AND: [scope, filters],
    };
  }

  private sortOrder(query: TicketQueryDto): Prisma.TicketOrderByWithRelationInput {
    if (query.sortBy === "priority") {
      return { priority: query.sortOrder === "asc" ? "asc" : "desc" };
    }
    return { createdAt: query.sortOrder === "asc" ? "asc" : "desc" };
  }

  private async recordOperation(
    actor: AuthenticatedUser,
    message: string,
    details: Prisma.InputJsonObject,
  ) {
    await this.logsService.safeRecord(
      this.logsService.audit(actor.id, message, details),
    );
  }

  private resolveCreateBranch(actor: AuthenticatedUser, requestedBranch?: string) {
    const branch = requestedBranch?.trim();
    if (actor.role === UserRole.EMPLOYEE || actor.role === UserRole.ADMIN) {
      if (!actor.branch) throw new ForbiddenException("Account has no assigned branch");
      if (branch && branch !== actor.branch) {
        throw new ForbiddenException("Tickets can only be created for your assigned branch");
      }
      return actor.branch;
    }
    if (!branch) throw new BadRequestException("Branch is required");
    if (actor.role === UserRole.MANAGER && !actor.managedBranches.includes(branch)) {
      throw new ForbiddenException("Branch is outside your managed branches");
    }
    return branch;
  }

  private assertCanAccessTicket(
    actor: AuthenticatedUser,
    ticket: { requesterId: string | null; assignedAdminId?: string | null; branch: string },
  ) {
    if (ticket.requesterId === actor.id) return;
    if (
      actor.role === UserRole.ADMIN &&
      ticket.assignedAdminId === actor.id
    ) return;
    this.assertCanAccessBranch(actor, ticket.branch);
  }

  private assertCanManageTicket(
    actor: AuthenticatedUser,
    ticket: { branch: string; assignedAdminId?: string | null },
  ) {
    if (actor.role === UserRole.ADMIN && ticket.assignedAdminId === actor.id) return;
    this.assertCanManageBranch(actor, ticket.branch);
  }

  private assertCanAccessBranch(actor: AuthenticatedUser, branch: string) {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.role === UserRole.ADMIN && actor.branch === branch) return;
    if (actor.role === UserRole.MANAGER && actor.managedBranches.includes(branch)) return;
    throw new ForbiddenException("Ticket is outside your access scope");
  }

  private assertCanManageBranch(actor: AuthenticatedUser, branch: string) {
    if (actor.role === UserRole.EMPLOYEE) {
      throw new ForbiddenException("Support staff access required");
    }
    this.assertCanAccessBranch(actor, branch);
  }

  private assertManager(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.MANAGER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Manager access required");
    }
  }
}
