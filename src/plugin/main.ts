
import type {
  UIToPluginMessage,
  PluginToUIMessage,
} from "../shared/messages";

figma.showUI(__html__, {
  width: 420,
  height: 640,
  themeColors: true,
});

figma.ui.onmessage = (message: UIToPluginMessage) => {
  if (message.type === "UI_READY") {
    const response: PluginToUIMessage = {
      type: "PLUGIN_READY",
      payload: {
        pluginName: "Frame2Slides",
        version: "0.1.0",
      },
    };

    figma.ui.postMessage(response);
  }
};
