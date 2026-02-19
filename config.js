
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
  databases: {
    officers: process.env.MYSQL_DB_OFFICERS,
    wofficers: process.env.MYSQL_DB_WOFFICERS,
    ratings: process.env.MYSQL_DB_RATINGS,
    ratingsA: process.env.MYSQL_DB_RATINGS_A,
    ratingsB: process.env.MYSQL_DB_RATINGS_B,
    juniorTrainee: process.env.MYSQL_DB_JUNIOR_TRAINEE,
  },
};

export default config;
