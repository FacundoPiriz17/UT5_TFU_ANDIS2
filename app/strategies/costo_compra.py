from abc import ABC, abstractmethod
from app.configuration import store


class EstrategiaCostoCompra(ABC):
    @abstractmethod
    def calcular(self, costo_base: int) -> int:
        raise NotImplementedError


class CostoNormal(EstrategiaCostoCompra):
    def calcular(self, costo_base: int) -> int:
        return costo_base


class DescuentoInvierno(EstrategiaCostoCompra):
    def calcular(self, costo_base: int) -> int:
        descuento = store.settings().winter_discount_percent
        return round(costo_base * (100 - descuento) / 100)


_ESTRATEGIAS: dict[str, EstrategiaCostoCompra] = {
    "normal": CostoNormal(),
    "invierno": DescuentoInvierno(),
}


def obtener_estrategia(nombre: str) -> EstrategiaCostoCompra:
    try:
        return _ESTRATEGIAS[nombre]
    except KeyError as exc:
        raise ValueError(
            f"Politica de costo no soportada: {nombre}"
        ) from exc
