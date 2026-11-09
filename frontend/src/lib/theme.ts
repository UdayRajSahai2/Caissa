export const THEME_STORAGE_KEY = "caissa-theme";

export type ThemeChoice = "system" | "light" | "dark";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
