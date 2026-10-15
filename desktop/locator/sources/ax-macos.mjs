import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../native/ax-macos.js", import.meta.url));

/** The macOS Accessibility API through JavaScript for Automation. Positions are
 * points, which are DIPs already. */
export const axMacos = {
  name: "macos",
  command: ({ x, y, title }) => ({
    file: "osascript",
    args: ["-l", "JavaScript", SCRIPT, String(x), String(y), title],
  }),
  roles: {
    AXApplication: "application",
    AXWindow: "window",
    AXSheet: "dialog",
    AXButton: "button",
    AXMenuButton: "button",
    AXPopUpButton: "combobox",
    AXCheckBox: "checkbox",
    AXRadioButton: "radiobutton",
    AXSlider: "slider",
    AXStaticText: "text",
    AXHeading: "heading",
    AXLink: "link",
    AXImage: "img",
    AXTextField: "textbox",
    AXTextArea: "textbox",
    AXSearchField: "searchbox",
    AXComboBox: "combobox",
    AXTable: "table",
    AXOutline: "tree",
    AXRow: "row",
    AXCell: "cell",
    AXList: "list",
    AXGroup: "group",
    AXScrollArea: "scrollpane",
    AXSplitGroup: "splitpane",
    AXTabGroup: "tablist",
    AXToolbar: "toolbar",
    AXMenuItem: "menuitem",
    AXWebArea: "document",
    AXProgressIndicator: "progressbar",
  },
};
