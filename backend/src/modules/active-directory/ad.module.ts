import { Module } from "@nestjs/common";
import { ActiveDirectoryController } from "./ad.controller";
import { ActiveDirectoryService } from "./ad.service";
import { LdapClientService } from "../../common/ldap/ldap-client.service";

@Module({
  controllers: [ActiveDirectoryController],
  providers: [ActiveDirectoryService, LdapClientService],
  exports: [ActiveDirectoryService],
})
export class ActiveDirectoryModule {}
