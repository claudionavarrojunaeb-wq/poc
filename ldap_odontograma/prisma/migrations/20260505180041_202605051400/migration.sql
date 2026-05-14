-- CreateTable
CREATE TABLE "Test" (
    "testid" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("testid")
);

-- CreateIndex
CREATE UNIQUE INDEX "Test_testid_key" ON "Test"("testid");
