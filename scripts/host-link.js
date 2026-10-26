import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeployment,
  persistentAdminToken,
  operatorLink,
} from "../server/deployment.js";
try {
  const config = loadDeployment(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  console.log(
    operatorLink(
      config,
      persistentAdminToken(config.dataDir, config.adminToken),
    ),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
