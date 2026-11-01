import bcrypt


def hashear_contrasena(contrasena: str) -> str:
    contrasena_hasheada = bcrypt.hashpw(
        contrasena.encode("utf-8"),
        bcrypt.gensalt(),
    )

    return contrasena_hasheada.decode("utf-8")


def verificar_contrasena(
    contrasena: str,
    contrasena_hasheada: str,
) -> bool:
    return bcrypt.checkpw(
        contrasena.encode("utf-8"),
        contrasena_hasheada.encode("utf-8"),
    )

def hasheo(contrasena: str) -> str:
    return hashear_contrasena(contrasena)
