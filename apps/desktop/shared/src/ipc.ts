export const IPC_CHANNELS = {
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  projectsUpdate: "projects:update",
  projectsDelete: "projects:delete",
  projectsPickPath: "projects:pickPath",
  threadsList: "threads:list",
  threadsCreate: "threads:create",
  threadsUpdate: "threads:update",
  threadsArchive: "threads:archive",
  threadsEvents: "threads:events",
  sessionsStart: "sessions:start",
  sessionsStop: "sessions:stop",
  sessionsSendInput: "sessions:sendInput",
  sessionsResize: "sessions:resize",
  sessionsEvent: "sessions:event",
  installerDoctor: "installer:doctor",
  installerInstallCli: "installer:installCli",
  installerVerify: "installer:verify",
  permissionsEvaluate: "permissions:evaluate",
  permissionsSetMode: "permissions:setMode",
  permissionsGetMode: "permissions:getMode",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  updatesCheck: "updates:check",
  updatesApply: "updates:apply"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
