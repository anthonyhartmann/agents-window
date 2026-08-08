import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(
        process.cwd(),
        ".agents-window-diagnostics-%DATE%.log",
      ),
      datePattern: "YYYY-MM-DD",
      maxSize: "5m", // Rotate log files when they reach 5MB
      maxFiles: "3", // Keep at most 3 rotated log files
      zippedArchive: true, // Compress rotated log files
    }),
  ],
});
