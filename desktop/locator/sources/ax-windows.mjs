import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../native/ax-windows.ps1", import.meta.url),
);

/** UI Automation through PowerShell. Rectangles are physical pixels; the shell
 * hands the source the DIP conversion. */
export const axWindows = {
  name: "windows",
  command: ({ x, y, title }) => ({
    file: "powershell",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT,
      String(x),
      String(y),
      title,
    ],
  }),
  roles: {
    "ControlType.Button": "button",
    "ControlType.SplitButton": "splitbutton",
    "ControlType.Text": "text",
    "ControlType.Image": "img",
    "ControlType.Hyperlink": "link",
    "ControlType.DataItem": "cell",
    "ControlType.Edit": "textbox",
    "ControlType.Document": "document",
    "ControlType.Window": "window",
    "ControlType.Pane": "pane",
    "ControlType.Group": "group",
    "ControlType.List": "list",
    "ControlType.ListItem": "listitem",
    "ControlType.Table": "table",
    "ControlType.DataGrid": "grid",
    "ControlType.Header": "columnheader",
    "ControlType.HeaderItem": "columnheader",
    "ControlType.Tab": "tablist",
    "ControlType.TabItem": "tab",
    "ControlType.Menu": "menu",
    "ControlType.MenuBar": "menubar",
    "ControlType.MenuItem": "menuitem",
    "ControlType.CheckBox": "checkbox",
    "ControlType.RadioButton": "radiobutton",
    "ControlType.ComboBox": "combobox",
    "ControlType.Slider": "slider",
    "ControlType.Spinner": "spinbutton",
    "ControlType.ProgressBar": "progressbar",
    "ControlType.ScrollBar": "scrollbar",
    "ControlType.ToolBar": "toolbar",
    "ControlType.ToolTip": "tooltip",
    "ControlType.Tree": "tree",
    "ControlType.TreeItem": "treeitem",
    "ControlType.TitleBar": "titlebar",
    "ControlType.StatusBar": "statusbar",
    "ControlType.Custom": "custom",
    "ControlType.Separator": "separator",
  },
};
