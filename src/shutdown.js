function installGracefulShutdown(server, options = {}) {
  const processTarget = options.processTarget || process;
  const logger = options.logger || {
    info: (entry) => console.log(JSON.stringify(entry)),
    error: (entry) => console.error(JSON.stringify(entry)),
  };
  const forceAfterMs = Number(options.forceAfterMs || process.env.SHUTDOWN_TIMEOUT_MS || 10000);
  const forceExit = options.forceExit || ((code) => processTarget.exit(code));
  let shuttingDown = false;
  let forceTimer;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: "shutdown_started", signal, forceAfterMs });
    forceTimer = setTimeout(() => {
      logger.error({ event: "shutdown_forced", signal, forceAfterMs });
      server.closeAllConnections?.();
      forceExit(1);
    }, forceAfterMs);
    forceTimer.unref?.();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logger.error({ event: "shutdown_failed", signal, errorType: error.name || "Error" });
        processTarget.exitCode = 1;
        return;
      }
      logger.info({ event: "shutdown_complete", signal });
      processTarget.exitCode = 0;
    });
    server.closeIdleConnections?.();
  }

  processTarget.once("SIGTERM", shutdown);
  processTarget.once("SIGINT", shutdown);

  return function uninstallGracefulShutdown() {
    clearTimeout(forceTimer);
    processTarget.removeListener("SIGTERM", shutdown);
    processTarget.removeListener("SIGINT", shutdown);
  };
}

module.exports = { installGracefulShutdown };
