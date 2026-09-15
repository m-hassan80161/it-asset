import { Module } from "@nestjs/common";
import { FileServerController } from "./file-server.controller";
import { FileServerService } from "./file-server.service";
import { WinRmService } from "../../common/winrm/winrm.service";

@Module({
  controllers: [FileServerController],
  providers: [FileServerService, WinRmService],
  exports: [FileServerService],
})
export class FileServerModule {}
