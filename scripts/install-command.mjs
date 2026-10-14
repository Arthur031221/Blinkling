// The one line a user pastes. The READMEs, the install guide and the scripts
// all derive it from config/install.json.
export function installCommand(
  { marketplace, plugin },
  { powershell = false } = {},
) {
  return `claude plugin marketplace add ${marketplace} ${powershell ? ";" : "&&"} claude plugin install ${plugin}`;
}
