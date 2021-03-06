-- Sample MySQL creation file

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

-- -----------------------------------------------------
-- Schema CodyColor
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `CodyColor` DEFAULT CHARACTER SET utf8;
USE `CodyColor`;

CREATE TABLE IF NOT EXISTS `CodyColor`.`Users` (
   `Id` VARBINARY(64) NOT NULL,
   `Email` VARCHAR(320) DEFAULT NULL COLLATE latin1_general_ci,
   `Nickname` VARCHAR(64) DEFAULT 'Anonymous',
   `Deleted` BIT(1) DEFAULT 0,

   PRIMARY KEY (`Id`)
)
ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `CodyColor`.`GameSessions` (
   `Id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
   `NumMatches` TINYINT UNSIGNED NOT NULL,
   `Type` CHAR(16),
   `BeginTimestamp` DATETIME NOT NULL,
   `MatchDurationMs` MEDIUMINT UNSIGNED DEFAULT 30000,

   PRIMARY KEY (`Id`)
)
ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `CodyColor`.`GameMatches` (
   `Id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
   `SessionId` INT UNSIGNED NOT NULL,
   `BeginTimestamp` DATETIME NOT NULL,
   `NumUsers` TINYINT UNSIGNED DEFAULT 2,

   PRIMARY KEY (`Id`),
   UNIQUE INDEX `MatchId_idx` (`Id` ASC),
   INDEX `SessionId_idx` (`SessionId` ASC),
   CONSTRAINT `fk_GameMatches_SessionId`
     FOREIGN KEY `SessionId_idx` (`SessionId`)
     REFERENCES `CodyColor`.`GameSessions` (`Id`)
     ON DELETE RESTRICT
     ON UPDATE RESTRICT
)
ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `CodyColor`.`MatchParticipants` (
   `SessionId` INT UNSIGNED NOT NULL,
   `MatchId` INT UNSIGNED NOT NULL,
   `UserId` VARBINARY(64) NOT NULL,
   `Registered` BIT(1) DEFAULT 0,
   `IsWallUser` BIT(1) DEFAULT 0,
   `BeginTimestamp` DATETIME NOT NULL,
   `Score` TINYINT UNSIGNED NOT NULL,
   `PathLength` SMALLINT UNSIGNED NOT NULL,
   `TimeMs` MEDIUMINT UNSIGNED NOT NULL,
   `Winner` BIT(1) DEFAULT 0,

   PRIMARY KEY (`SessionId`, `MatchId`, `UserId`),
   INDEX `SessionId_idx` (`SessionId` ASC),
   CONSTRAINT `fk_MatchParticipants_SessionId`
     FOREIGN KEY `SessionId_idx` (`SessionId`)
     REFERENCES `CodyColor`.`GameSessions` (`Id`)
     ON DELETE RESTRICT
     ON UPDATE RESTRICT,
   INDEX `MatchId_idx` (`MatchId` ASC),
   CONSTRAINT `fk_MatchParticipants_MatchId`
     FOREIGN KEY `MatchId_idx` (`MatchId`)
     REFERENCES `CodyColor`.`GameMatches` (`Id`)
     ON DELETE RESTRICT
     ON UPDATE RESTRICT,
   INDEX `Score_idx` (`Score` DESC),
   INDEX `ScorePerDay_idx` (`BeginTimestamp` ASC, `Score` DESC),
   INDEX `Path_idx` (`PathLength` DESC),
   INDEX `PathPerDay_idx` (`BeginTimestamp` ASC, `PathLength` DESC)
)
ENGINE = InnoDB;


CREATE TABLE IF NOT EXISTS `CodyColor`.`WallUsers` (
   `Id` VARBINARY(64) NOT NULL,
   `Name` VARCHAR(64) DEFAULT 'Anonymous',
   `Surname` VARCHAR(64) DEFAULT 'Anonymous',
   `Deleted` BIT(1) DEFAULT 0,

   PRIMARY KEY (`Id`)
)
ENGINE = InnoDB;

-- Aggiunge la colonna isWallUser alla tabella matchParticipants per permettere la wall authentication
-- Necessario per compatibilità, in quanto la colonna isWallUser non era prevista nella prima versione del db.
-- La procedura viene eseguita solo nel caso in cui la colonna non sia presente nella tabella
-- https://stackoverflow.com/a/45548042
DROP PROCEDURE IF EXISTS `addWallColumn`;
DELIMITER //
CREATE PROCEDURE `addWallColumn`()
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
  ALTER TABLE  `CodyColor`.`MatchParticipants` ADD COLUMN `IsWallUser` BIT(1) DEFAULT 0;
END //
DELIMITER ;
CALL `addWallColumn`();
DROP PROCEDURE `addWallColumn`;