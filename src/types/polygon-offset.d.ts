declare module "polygon-offset" {
  type Punto = [number, number];
  type Anillo = Punto[];

  export default class Offset {
    data(anillo: Anillo): Offset;
    margin(distancia: number): Anillo[];
    padding(distancia: number): Anillo[];
    offset(distancia: number): Anillo[];
    arcSegments(n: number): Offset;
  }
}
