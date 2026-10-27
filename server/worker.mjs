import {handleOperations} from './lib/operations-server.mjs';
export default {fetch(request,env){return handleOperations(request,env.DB);}};
