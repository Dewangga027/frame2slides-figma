
export type UIToPluginMessage = {
  type: "UI_READY";
};

export type PluginToUIMessage = {
  type: "PLUGIN_READY";
  payload: {
    pluginName: string;
    version: string;
  };
};
