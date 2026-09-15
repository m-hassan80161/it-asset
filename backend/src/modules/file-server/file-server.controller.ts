import { Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FileServerService } from "./file-server.service";

@ApiTags("file-server")
@Controller("file-server")
export class FileServerController {
  constructor(private readonly fileServerService: FileServerService) {}

  @Post("discover-departments")
  discoverDepartmentFolders() {
    return this.fileServerService.discoverDepartmentFolders();
  }

  @Get("departments")
  listDepartments() {
    return this.fileServerService.listDepartmentFolders();
  }
}
