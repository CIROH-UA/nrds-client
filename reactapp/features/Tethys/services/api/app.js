import apiClient from "features/Tethys/services/api/client";

const APP_ROOT_URL = process.env.TETHYS_APP_ROOT_URL;

const appAPI = {
    getArrowPerVpu: (data) => {
        return apiClient.post(
            `${APP_ROOT_URL}getArrowPerVpu/`, 
            { ...data },
            {
                responseType: "arraybuffer",          // key point: binary, not JSON
                headers: { "Content-Type": "application/json"},
            }
       );
    }


}
 
export default appAPI;