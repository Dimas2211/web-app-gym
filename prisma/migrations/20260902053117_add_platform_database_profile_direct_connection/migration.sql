-- AlterTable
ALTER TABLE "platform_database_profiles" ADD COLUMN     "direct_db_host" TEXT,
ADD COLUMN     "direct_db_name" TEXT,
ADD COLUMN     "direct_db_port" INTEGER,
ADD COLUMN     "direct_db_user" TEXT,
ADD COLUMN     "direct_encrypted_password" TEXT,
ADD COLUMN     "direct_ssl_mode" "PlatformDatabaseSslMode";
