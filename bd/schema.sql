USE db_games;

CREATE TABLE Persona (
    EmailPersona VARCHAR(100) PRIMARY KEY,
    NombrePersona VARCHAR(30) NOT NULL,
    ApellidoPersona VARCHAR(30) NOT NULL
);

CREATE TABLE Login (
    EmailPersona VARCHAR(100) PRIMARY KEY,
    ContrasenaLogin VARCHAR(256) NOT NULL,
    FechaCreacion DATETIME DEFAULT(NOW()),
    FOREIGN KEY (EmailPersona) REFERENCES Persona(EmailPersona)
);

CREATE TABLE Genero (
    NombreGenero VARCHAR(30) PRIMARY KEY,
    DescripcionGenero VARCHAR(300)
);

CREATE TABLE Juego (
    IdJuego INT AUTO_INCREMENT PRIMARY KEY,
    NombreJuego VARCHAR(100) NOT NULL
);

CREATE TABLE JuegoTieneGenero (
    IdJuego INT,
    NombreGenero VARCHAR(30),
    FOREIGN KEY (IdJuego) REFERENCES Juego(IdJuego),
    FOREIGN KEY (NombreGenero) REFERENCES Genero(NombreGenero),
    PRIMARY KEY (IdJuego, NombreGenero)
);

CREATE TABLE Compra (
    EmailPersona VARCHAR(300),
    IdJuego INT,
    FechaHoraCompra DATETIME DEFAULT(NOW()),
    CostoCompra INT,
    FOREIGN KEY (EmailPersona) REFERENCES Persona(EmailPersona),
    FOREIGN KEY (IdJuego) REFERENCES Juego(IdJuego),
    PRIMARY KEY (EmailPersona, IdJuego)
);

CREATE TABLE Copia (
    IdJuego INT,
    EmailPersona VARCHAR(300),
    FOREIGN KEY (IdJuego) REFERENCES Juego(IdJuego),
    FOREIGN KEY (EmailPersona) REFERENCES Persona(EmailPersona),
    PRIMARY KEY (IdJuego, EmailPersona)
);
