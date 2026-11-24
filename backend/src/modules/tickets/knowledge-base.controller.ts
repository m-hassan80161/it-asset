import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Body,
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
import { CreateKnowledgeArticleDto } from "./dto/create-knowledge-article.dto";
import { KnowledgeQueryDto } from "./dto/knowledge-query.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const acceptedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "video/mp4",
  "video/webm",
];

@ApiTags("knowledge-base")
@Controller("knowledge-base")
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: KnowledgeQueryDto) {
    return this.knowledgeBaseService.list(this.requireUser(request), query.q);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateKnowledgeArticleDto,
  ) {
    return this.knowledgeBaseService.create(this.requireUser(request), dto);
  }

  @Post(":id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!acceptedMimeTypes.includes(file.mimetype)) {
          callback(new BadRequestException("Only PDF, PNG, JPEG, MP4, and WebM files are accepted"), false);
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
    return this.knowledgeBaseService.addAttachment(this.requireUser(request), id, file);
  }

  @Get(":id/attachments/:attachmentId")
  getAttachment(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.knowledgeBaseService.getAttachment(this.requireUser(request), id, attachmentId);
  }

  private requireUser(request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return request.user;
  }
}
