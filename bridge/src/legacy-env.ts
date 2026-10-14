// Imported first by the entry point: settings such as the port are read when
// their modules load, so the previous release's environment names must be adopted before that.
import { adoptLegacyEnv } from "../../plugin/desktop/legacy.mjs";

adoptLegacyEnv();
