import apiClient from "features/Tethys/services/api/client";

// JWT token storage helpers
const ACCESS_TOKEN_KEY = "jwt_access";
const REFRESH_TOKEN_KEY = "jwt_refresh";

function setTokens(access, refresh) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}
async function getJWTToken() {
  const response = await apiClient.get("/api/token/", {});
  const access = response.access;
  const refresh = response.refresh;
  setTokens(access, refresh);
  return { access, refresh };
}

function getUserData() {
  return apiClient.get("/api/whoami/");
}

function getAppData(tethys_app_url) {
  return apiClient.get(`/api/apps/${tethys_app_url}/`);
}

function getCSRF() {
  return apiClient.get("/api/csrf/").then((response) => {
    return response.headers["x-csrftoken"];
  });
}

const tethysAPI = {
  getJWTToken,
  getAppData,
  getUserData,
  getCSRF,
};

export default tethysAPI;