import {
  Body,
  DefineStar,
  Equator,
  Horizon,
  Illumination,
  Observer,
} from "astronomy-engine";

export type ObservationTarget = {
  id: string;
  altitude: number;
  azimuth: number;
  time: Date;
  equipment: "eyes" | "binoculars" | "telescope";
  score: number;
};

type TargetDefinition = {
  id: string;
  body: Body;
  equipment: ObservationTarget["equipment"];
  priority: number;
  deepSky?: boolean;
  ra?: number;
  dec?: number;
  distance?: number;
};

const TARGETS: TargetDefinition[] = [
  { id: "moon", body: Body.Moon, equipment: "eyes", priority: 20 },
  { id: "venus", body: Body.Venus, equipment: "eyes", priority: 18 },
  { id: "jupiter", body: Body.Jupiter, equipment: "eyes", priority: 20 },
  { id: "saturn", body: Body.Saturn, equipment: "telescope", priority: 18 },
  { id: "mars", body: Body.Mars, equipment: "eyes", priority: 12 },
  {
    id: "andromeda",
    body: Body.Star1,
    equipment: "binoculars",
    priority: 12,
    deepSky: true,
    ra: 0.712,
    dec: 41.269,
    distance: 2_500_000,
  },
  {
    id: "pleiades",
    body: Body.Star2,
    equipment: "eyes",
    priority: 18,
    deepSky: true,
    ra: 3.79,
    dec: 24.117,
    distance: 444,
  },
  {
    id: "orionNebula",
    body: Body.Star3,
    equipment: "binoculars",
    priority: 16,
    deepSky: true,
    ra: 5.588,
    dec: -5.391,
    distance: 1_344,
  },
  {
    id: "doubleCluster",
    body: Body.Star4,
    equipment: "binoculars",
    priority: 15,
    deepSky: true,
    ra: 2.333,
    dec: 57.133,
    distance: 7_500,
  },
];

for (const target of TARGETS) {
  if (target.ra !== undefined && target.dec !== undefined && target.distance !== undefined) {
    DefineStar(target.body, target.ra, target.dec, target.distance);
  }
}

export function getObservationTargets(
  latitude: number,
  longitude: number,
  dates: Date[],
  moonPhase: number,
) {
  if (dates.length === 0) return [];

  const observer = new Observer(latitude, longitude, 0);
  const moonBrightness = 1 - Math.abs(moonPhase - 0.5) * 2;

  return TARGETS.map((target) => {
    const positions = dates.map((time) => {
      const equatorial = Equator(target.body, time, observer, true, true);
      const horizontal = Horizon(time, observer, equatorial.ra, equatorial.dec, "normal");
      return { time, altitude: horizontal.altitude, azimuth: horizontal.azimuth };
    });
    const best = positions.sort((first, second) => second.altitude - first.altitude)[0];
    const magnitude = target.deepSky ? 0 : Illumination(target.body, best.time).mag;
    const darknessPenalty = target.deepSky ? moonBrightness * 22 : 0;
    const score = best.altitude + target.priority - Math.max(0, magnitude) * 3 - darknessPenalty;

    return {
      id: target.id,
      altitude: Math.round(best.altitude),
      azimuth: Math.round(best.azimuth),
      time: best.time,
      equipment: target.equipment,
      score,
    } satisfies ObservationTarget;
  })
    .filter((target) => target.altitude >= 15)
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);
}
