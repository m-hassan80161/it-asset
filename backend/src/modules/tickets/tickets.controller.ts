import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { AssignTicketDto } from "./dto/assign-ticket.dto";
import { CommentDto } from "./dto/comment.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { TicketQueryDto } from "./dto/ticket-query.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { RequestTransferDto } from "./dto/request-transfer.dto";
import { TicketsService } from "./tickets.service";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("tickets")
@Controller("tickets")
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  createTicket(@Req() request: AuthenticatedRequest, @Body() dto: CreateTicketDto) {
    return this.ticketsService.createTicket(this.requireUser(request), dto);
  }

  @Get("admin/branch/:branch")
  getAdminBranchTickets(
    @Req() request: AuthenticatedRequest,
    @Param("branch") branch: string,
    @Query() query: TicketQueryDto,
  ) {
    return this.ticketsService.listBranchTickets(this.requireUser(request), branch, query);
  }

  @Get("manager/dashboard")
  getManagerDashboard(@Req() request: AuthenticatedRequest) {
    return this.ticketsService.getManagerDashboard(this.requireUser(request));
  }

  @Get("manager/tickets")
  getManagerTickets(
    @Req() request: AuthenticatedRequest,
    @Query() query: TicketQueryDto,
  ) {
    return this.ticketsService.listTickets(this.requireUser(request), query);
  }

  @Get("admin/dashboard")
  getAdminDashboard(@Req() request: AuthenticatedRequest) {
    return this.ticketsService.getAdminDashboard(this.requireUser(request));
  }

  @Get("admin/transfer-targets")
  getTransferTargets(@Req() request: AuthenticatedRequest) {
    return this.ticketsService.getTransferTargets(this.requireUser(request));
  }

  @Get("admin/transfers/inbox")
  getTransferInbox(@Req() request: AuthenticatedRequest) {
    return this.ticketsService.getTransferInbox(this.requireUser(request));
  }

  @Get("manager/stats")
  getManagerStats(@Req() request: AuthenticatedRequest) {
    return this.ticketsService.getManagerStats(this.requireUser(request));
  }

  @Get()
  listMyTickets(
    @Req() request: AuthenticatedRequest,
    @Query() query: TicketQueryDto,
  ) {
    return this.ticketsService.listTickets(this.requireUser(request), query);
  }

  @Get(":id")
  getTicket(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.ticketsService.getTicket(this.requireUser(request), id);
  }

  @Patch(":id/assign")
  assignTicket(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketsService.assignTicket(this.requireUser(request), id, dto);
  }

  @Post(":id/transfer-requests")
  requestTransfer(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RequestTransferDto,
  ) {
    return this.ticketsService.requestTransfer(this.requireUser(request), id, dto);
  }

  @Post("transfer-requests/:requestId/approve")
  approveTransfer(
    @Req() request: AuthenticatedRequest,
    @Param("requestId") requestId: string,
  ) {
    return this.ticketsService.respondToTransfer(this.requireUser(request), requestId, true);
  }

  @Post("transfer-requests/:requestId/reject")
  rejectTransfer(
    @Req() request: AuthenticatedRequest,
    @Param("requestId") requestId: string,
  ) {
    return this.ticketsService.respondToTransfer(this.requireUser(request), requestId, false);
  }

  @Post(":id/comment")
  addComment(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CommentDto,
  ) {
    return this.ticketsService.addComment(this.requireUser(request), id, dto);
  }

  @Post(":id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype)) {
          callback(new BadRequestException("Only PDF, PNG, and JPEG files are accepted"), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  addAttachment(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @UploadedFile()
    file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException("Attachment file is required");
    return this.ticketsService.addAttachment(this.requireUser(request), id, file);
  }

  @Get(":id/attachments/:attachmentId")
  getAttachment(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.ticketsService.getAttachment(this.requireUser(request), id, attachmentId);
  }

  @Post(":id/close")
  closeTicket(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.ticketsService.closeTicket(this.requireUser(request), id);
  }

  @Patch(":id")
  updateTicket(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.updateTicket(this.requireUser(request), id, dto);
  }

  private requireUser(request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return request.user;
  }
}
