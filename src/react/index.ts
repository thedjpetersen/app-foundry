export {
  ShellAppBoundary,
  type ShellAppBoundaryProps,
  type ShellAppErrorViewProps,
  type ShellAppOutletState,
  type UseShellAppOutletOptions,
  useShellAppOutlet,
} from "./app-runtime.js";
export {
  CapabilityProvider,
  useCan,
  useCapabilities,
  usePermissionEditor,
  type CapabilityProviderProps,
  type PermissionEditor,
  type PermissionEditorGroup,
  type PermissionEditorOptions,
  type PermissionEditorRow,
  type PermissionOverrideState,
} from "./capabilities.js";
export {
  buildCommandItems,
  groupCommandItems,
  type ShellCommandPaletteGroup,
  type ShellCommandPaletteItem,
  type ShellCommandPaletteModel,
  useShellCommandPaletteModel,
} from "./command-palette-model.js";
export { type ShellFrameModel, useShellFrameModel } from "./frame-model.js";
export {
  groupSettingsByRing,
  preferredSettingsGroup,
  type SettingsRingGroup,
  type ShellPreferencesModel,
  useShellPreferencesModel,
} from "./preferences-model.js";
export {
  defineShellPresentationAdapter,
  type ShellPresentationAdapter,
  type ShellPresentationAppOutletProps,
  type ShellPresentationCommandPaletteProps,
  type ShellPresentationErrorBoundaryProps,
  type ShellPresentationFrameProps,
  type ShellPresentationPreferencesProps,
} from "./presentation-adapter.js";
export {
  useCommandSource,
  useContextKey,
  useEntityActions,
  useHostVersion,
  usePreferenceInspection,
  useSettingsGroups,
  useShellSideNavMount,
  useShellSideNavMounts,
  useShellTopNavHeader,
  useShellTopNavMount,
  useShellTopNavMounts,
  useVisibleCommands,
} from "./react-bindings.js";
