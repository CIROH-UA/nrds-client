import apiClient from "features/Tethys/services/api/client";

const APP_ROOT_URL = process.env.TETHYS_APP_ROOT_URL;

const appAPI = {
    /**
     * Ask the app to convert a NetCDF output into Arrow.
     *
     * Takes a config so the caller can pass a signal and watch progress. The client this uses is
     * shared with the four calls the shell blocks startup on, so a limit belongs on the request
     * rather than on the client: this one waits while the server fetches a five megabyte file
     * from s3 and converts it, and those four should not be given the same allowance.
     */
    getArrowPerVpu: (data, config = {}) => {
        return apiClient.post(
            `${APP_ROOT_URL}getArrowPerVpu/`, 
            { ...data },
            {
                responseType: "arraybuffer",          // key point: binary, not JSON
                headers: { "Content-Type": "application/json"},
                ...config,
            }
       );
    }


}
 
export default appAPI;