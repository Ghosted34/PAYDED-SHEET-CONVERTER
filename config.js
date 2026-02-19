
import { config as _config } from "dotenv";


_config();

const config = {
  app: {
    port: process.env.PORT,
    env: process.env.NODE_ENV || "development",
  },
  mssql: {
    host: process.env.MSSQL_HOST || "localhost",
    port: Number(process.env.MSSQL_PORT) || 1433,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    db:'',
    uri:''
  }, 
};

export default config;
