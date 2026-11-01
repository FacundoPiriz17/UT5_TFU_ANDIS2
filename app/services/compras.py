"""Fachada de compatibilidad para scripts UT3; HTTP usa las capas CQRS explícitas."""
from app.services.compras_commands import crear_compra, eliminar_compra, recalcular_compra
from app.services.compras_queries import listar_compras

# Esta función interna heredada ahora devuelve DTO de lectura.
_buscar_compras = listar_compras
