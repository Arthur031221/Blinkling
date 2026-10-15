import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../native/ax-linux.py", import.meta.url));

/** AT-SPI through python3-gi. Atspi role names are close to ARIA's once the
 * spaces go; the few that are not are listed. */
export const axLinux = {
  name: "linux",
  command: ({ x, y, title }) => ({
    file: "python3",
    args: ["-I", SCRIPT, String(x), String(y), title],
  }),
  roles: {
    static: "text",
    entry: "textbox",
    "push button": "button",
    "toggle button": "button",
    "check box": "checkbox",
    "radio button": "radiobutton",
    "combo box": "combobox",
    "page tab": "tab",
    "page tab list": "tablist",
    "tool bar": "toolbar",
    "menu item": "menuitem",
    "table row": "row",
    "table cell": "cell",
    "column header": "columnheader",
    "row header": "rowheader",
    "document web": "document",
    "document frame": "document",
    "scroll pane": "scrollpane",
    "split pane": "splitpane",
    "layered pane": "layeredpane",
    "status bar": "statusbar",
    "list item": "listitem",
    "tree item": "treeitem",
    "tree table": "treegrid",
    "level bar": "progressbar",
    "spin button": "spinbutton",
  },
};
