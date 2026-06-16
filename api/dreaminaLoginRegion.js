export const DREAMINA_LOGIN_REGION_CN = "cn";
export const DREAMINA_LOGIN_REGION_OVERSEAS = "overseas";

export const DREAMINA_CN_LOGIN_PAGE_URL = "https://jimeng.jianying.com/ai-tool/login";
export const DREAMINA_OVERSEAS_LOGIN_PAGE_URL = "https://dreamina.capcut.com/ai-tool/login";
export const DREAMINA_OVERSEAS_VPN_MESSAGE = "请检查 VPN 是否已开启";

const OVERSEAS_ALIASES = new Set(["overseas", "global", "international", "intl"]);

export function normalizeDreaminaLoginRegion(value) {
  const region = String(value || "").trim().toLowerCase();
  return OVERSEAS_ALIASES.has(region)
    ? DREAMINA_LOGIN_REGION_OVERSEAS
    : DREAMINA_LOGIN_REGION_CN;
}

export function getDreaminaLoginPageUrl(region) {
  return normalizeDreaminaLoginRegion(region) === DREAMINA_LOGIN_REGION_OVERSEAS
    ? DREAMINA_OVERSEAS_LOGIN_PAGE_URL
    : DREAMINA_CN_LOGIN_PAGE_URL;
}

export function shouldWarnDreaminaVpn(region) {
  return normalizeDreaminaLoginRegion(region) === DREAMINA_LOGIN_REGION_OVERSEAS;
}
