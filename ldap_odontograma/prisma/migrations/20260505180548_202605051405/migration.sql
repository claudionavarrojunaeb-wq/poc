-- CreateTable
CREATE TABLE "users" (
    "userid" SERIAL NOT NULL,
    "useremail" VARCHAR(100) NOT NULL,
    "userpwd" VARCHAR(50) NOT NULL,
    "usertipo" INTEGER NOT NULL,
    "username" VARCHAR(100) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userid")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userid_key" ON "users"("userid");
