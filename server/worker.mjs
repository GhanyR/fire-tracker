import {handleOperations} from './lib/operations-server.mjs';
import {handleAlerts} from './lib/nearby-alerts-server.mjs';
export default {fetch(request,env){return new URL(request.url).pathname.startsWith('/api/alerts/')?handleAlerts(request,env.DB,env):handleOperations(request,env.DB);}};
