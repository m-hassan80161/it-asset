import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { CreateKnowledgeArticleDto } from "./dto/create-knowledge-article.dto";

const maxAttachmentSize = 25 * 1024 * 1024;
const knowledgeAttachmentInclude = {
  attachments: {
    select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.KnowledgeArticleInclude;

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, search?: string) {
    this.assertSupportStaff(actor);
    const term = search?.trim();
    return this.prisma.knowledgeArticle.findMany({
      where: term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { problem: { contains: term, mode: "insensitive" } },
              { solution: { contains: term, mode: "insensitive" } },
              { keywords: { contains: term, mode: "insensitive" } },
            ],
          }
        : undefined,
      take: 100,
      orderBy: { updatedAt: "desc" },
      include: knowledgeAttachmentInclude,
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateKnowledgeArticleDto) {
    this.assertSupportStaff(actor);
    return this.prisma.knowledgeArticle.create({
      data: {
        title: dto.title.trim(),
        problem: dto.problem.trim(),
        solution: dto.solution.trim(),
        keywords: dto.keywords?.trim() ?? "",
        authorId: actor.id,
        authorName: actor.fullName,
      },
      include: knowledgeAttachmentInclude,
    });
  }

  async addAttachment(
    actor: AuthenticatedUser,
    articleId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    this.assertSupportStaff(actor);
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) throw new NotFoundException("Knowledge article not found");
    if (file.size < 1 || file.size > maxAttachmentSize) {
      throw new BadRequestException("Knowledge attachment must be between 1 byte and 25 MB");
    }

    const signature = file.buffer.subarray(0, 12);
    const isPdf = file.mimetype === "application/pdf" &&
      signature.subarray(0, 5).toString("ascii") === "%PDF-";
    const isPng = file.mimetype === "image/png" &&
      signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = file.mimetype === "image/jpeg" &&
      signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    const isMp4 = file.mimetype === "video/mp4" &&
      signature.subarray(4, 8).toString("ascii") === "ftyp";
    const isWebm = file.mimetype === "video/webm" &&
      signature.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!isPdf && !isPng && !isJpeg && !isMp4 && !isWebm) {
      throw new BadRequestException("Only valid PDF, PNG, JPEG, MP4, or WebM files are accepted");
    }

    return this.prisma.knowledgeAttachment.create({
      data: {
        articleId,
        fileName: file.originalname.replace(/[^\w .()-]/g, "_").slice(0, 180) || "attachment",
        fileUrl: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      select: { id: true, articleId: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    });
  }

  async getAttachment(actor: AuthenticatedUser, articleId: string, attachmentId: string) {
    this.assertSupportStaff(actor);
    const attachment = await this.prisma.knowledgeAttachment.findFirst({
      where: { id: attachmentId, articleId },
      select: { fileName: true, fileUrl: true, mimeType: true },
    });
    if (!attachment) throw new NotFoundException("Knowledge attachment not found");
    return attachment;
  }

  private assertSupportStaff(actor: AuthenticatedUser) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenException("Knowledge base access is restricted to support staff");
    }
  }
}
