USE db_games;

-- Perfiles locales de las identidades federadas definidas en Keycloak.
-- INSERT IGNORE permite aplicar el seed sin sobrescribir datos existentes.
INSERT IGNORE INTO Persona (
    EmailPersona,
    NombrePersona,
    ApellidoPersona
)
VALUES
    ('demo@adaii.local', 'Usuario', 'Demo'),
    ('segundo@adaii.local', 'Segundo', 'Demo'),
    ('admin@adaii.local', 'Administrador', 'Demo');

-- Credencial histórica de UT3; la autenticación UT4 se realiza en Keycloak.
INSERT IGNORE INTO Login (
    EmailPersona,
    ContrasenaLogin
)
VALUES (
    'demo@adaii.local',
    '$2b$12$g95/khE28S0MWLLKyVfDUeBl8ihehINVRTV.kVnSKuH5Zev41nIO2'
);

INSERT IGNORE INTO Genero (
    NombreGenero,
    DescripcionGenero
)
VALUES
    ('Accion', 'Genero de accion'),
    ('Indie', 'Juegos independientes');

INSERT IGNORE INTO Juego (
    IdJuego,
    NombreJuego
)
VALUES
    (1, 'Juego Demo Normal'),
    (2, 'Juego Demo Invierno');

INSERT IGNORE INTO JuegoTieneGenero (
    IdJuego,
    NombreGenero
)
VALUES
    (1, 'Accion'),
    (2, 'Indie');
