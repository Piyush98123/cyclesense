import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121417",
  onSurface: "#F0F2F5",
  surfaceSecondary: "#1A1D23",
  onSurfaceSecondary: "#C5CBCF",
  surfaceTertiary: "#22262E",
  onSurfaceTertiary: "#9FA6B2",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#121417",
  muted: "#8A92A0",
  brand: "#FF6B2B",
  onBrand: "#121417",
  brandPrimary: "#FF6B2B",
  onBrandPrimary: "#121417",
  brandSecondary: "#D95212",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#2B1A12",
  onBrandTertiary: "#FF9466",
  success: "#22C55E",
  onSuccess: "#121417",
  warning: "#F59E0B",
  onWarning: "#121417",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",
  border: "#2A2F3A",
  borderStrong: "#FF6B2B",
  divider: "#1F242C",
};

export type ThemeColors = typeof dark;
export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}