import type { GpuEffectDefinition } from '../types'
import {
  DEFAULT_PROJECTION_360_SETTINGS,
  type HorizonLockMode,
} from '@/types/projection360'

const PROJECTION_360_SHADER = /* wgsl */ `
struct Projection360Params {
  outputSize: vec2f,
  sourceSize: vec2f,
  fov: f32,
  distance: f32,
  distortion: f32,
  yaw: f32,
  pitch: f32,
  roll: f32,
  horizonLock: f32,
  horizonOffset: f32,
  enabled: f32,
  sourceMode: f32,
  dewarpMode: f32,
  _pad2: f32,
};

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Projection360Params;

const HALF_PI: f32 = 1.5707963267948966;

@fragment
fn projection360Fragment(input: VertexOutput) -> @location(0) vec4f {
  var sampleUv = input.uv;
  var inBounds = true;

  if (params.enabled >= 0.5) {
    let aspect = params.outputSize.x / max(params.outputSize.y, 0.001);

    // Angles in radians
    let yawRad = params.yaw * (PI / 180.0);
    let pitchRad = params.pitch * (PI / 180.0);
    let rollRad = params.roll * (PI / 180.0);
    let horizonOffsetRad = params.horizonOffset * (PI / 180.0);

    // Horizon lock calculation
    var effectiveRoll = rollRad + horizonOffsetRad;
    if (params.horizonLock > 1.5) {
      // 360 Horizon Lock: Roll stabilized to horizon offset
      effectiveRoll = horizonOffsetRad;
    } else if (params.horizonLock > 0.5) {
      // 45 Horizon Lock: Dampen within +-45 deg (PI/4)
      let limit = PI * 0.25;
      let clamped = clamp(rollRad, -limit, limit);
      effectiveRoll = (rollRad - clamped) + horizonOffsetRad;
    }

    // ============================================================
    // MODE 0: Planar Lens Dewarp & FOV (UltraWide / Action Cam)
    // ============================================================
    if (params.sourceMode < 0.5) {
      var coord = (input.uv - vec2f(0.5)) * vec2f(aspect, 1.0) * 2.0;

      if (params.dewarpMode < 0.5) {
        // --------------------------------------------------------
        // SUBMODE A: UltraWide & Wide (Native Action Cam Lens)
        // Preserves 100% of native curved lens optics without
        // flattening (exact appearance approved by user)
        // --------------------------------------------------------
        let baseFovRad = 110.0 * (PI / 180.0);
        let targetFovRad = clamp(params.fov, 30.0, 150.0) * (PI / 180.0);
        let fovRatio = tan(baseFovRad * 0.5) / max(tan(targetFovRad * 0.5), 0.001);
        let fovZoom = pow(fovRatio, 0.45);
        let totalZoom = fovZoom * max(params.distance, 0.1);
        coord = coord / totalZoom;

        // 1. Horizon Roll
        let cosR = cos(effectiveRoll);
        let sinR = sin(effectiveRoll);
        coord = vec2f(coord.x * cosR - coord.y * sinR, coord.x * sinR + coord.y * cosR);

        // 2. 3D Perspective Tilt (Yaw & Pitch)
        let ray = normalize(vec3f(coord.x, -coord.y, 1.0));
        let cosP = cos(pitchRad);
        let sinP = sin(pitchRad);
        let rX = vec3f(ray.x, ray.y * cosP - ray.z * sinP, ray.y * sinP + ray.z * cosP);
        let cosY = cos(yawRad);
        let sinY = sin(yawRad);
        let rY = vec3f(rX.x * cosY + rX.z * sinY, rX.y, -rX.x * sinY + rX.z * cosY);
        if (rY.z > 0.05) {
          coord = vec2f(rY.x / rY.z, -rY.y / rY.z);
        }
      } else {
        // --------------------------------------------------------
        // SUBMODE B: Linear, Narrow, 45° & 360° Horizont
        // Exact 3D Pinhole-to-Equisolid Camera Ray Dewarping
        // Replicating Insta360 Studio Linear (Zero Curvature / 100% Flat)
        // --------------------------------------------------------
        let targetFovRad = clamp(params.fov, 30.0, 150.0) * (PI / 180.0);
        let tanHalfFov = tan(targetFovRad * 0.5);

        // Rectilinear pinhole ray on output screen (normalized by aspect)
        let xu = (input.uv.x - 0.5) * 2.0 * tanHalfFov;
        let yu = -(input.uv.y - 0.5) * 2.0 * (tanHalfFov / aspect);
        let zu = max(params.distance, 0.1);

        // 1. Roll & Horizon Lock
        let cosR = cos(effectiveRoll);
        let sinR = sin(effectiveRoll);
        let rZ = vec3f(xu * cosR - yu * sinR, xu * sinR + yu * cosR, zu);

        // 2. Pitch
        let cosP = cos(pitchRad);
        let sinP = sin(pitchRad);
        let rX = vec3f(rZ.x, rZ.y * cosP - rZ.z * sinP, rZ.y * sinP + rZ.z * cosP);

        // 3. Yaw
        let cosY = cos(yawRad);
        let sinY = sin(yawRad);
        let rY = vec3f(rX.x * cosY + rX.z * sinY, rX.y, -rX.x * sinY + rX.z * cosY);

        if (rY.z > 0.02) {
          let rayLen = length(rY);
          let ray = rY / rayLen;
          let theta = acos(clamp(ray.z, -1.0, 1.0));
          let rxy = max(length(vec2f(ray.x, ray.y)), 0.00001);
          let dir = vec2f(ray.x, ray.y) / rxy;

          // Camera lens equisolid mapping:
          // In native action cam video, a point at angle theta projects to:
          // rd = 2 * sin(theta / 2)
          // Base native lens horizontal FOV is 110 deg (55 deg half-FOV)
          let baseHalfFov = 55.0 * (PI / 180.0);
          let baseRd = 2.0 * sin(baseHalfFov * 0.5);
          let equiScale = (2.0 * sin(theta * 0.5)) / max(baseRd, 0.0001);

          let d = clamp(params.distortion, 0.0, 1.0);
          let rectScale = tan(theta) / max(tan(baseHalfFov), 0.0001);
          let lensScale = mix(rectScale, equiScale, d);

          // Map back to input video UV (with aspect ratio preservation)
          let sampleX = (dir.x * lensScale) * 0.5 + 0.5;
          let sampleY = (-dir.y * lensScale * aspect) * 0.5 + 0.5;

          coord = vec2f((sampleX - 0.5) * 2.0 * aspect, (sampleY - 0.5) * 2.0);
        }
      }

      // Map back to [0..1] UV space
      let u = (coord.x / aspect) * 0.5 + 0.5;
      let v = coord.y * 0.5 + 0.5;

      inBounds = (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0);
      sampleUv = clamp(vec2f(u, v), vec2f(0.0001), vec2f(0.9999));
    } else {
      // ============================================================
      // MODE 1: Spherical 360 (Equirectangular Video)
      // For true 360° spherical footage (reframing onto camera plane)
      // ============================================================
      let screen = (input.uv - vec2f(0.5)) * vec2f(aspect, 1.0) * 2.0;

      let fovRad = params.fov * (PI / 180.0);
      let f = 1.0 / max(tan(fovRad * 0.5), 0.001) * max(params.distance, 0.1);

      var rx = screen.x / f;
      var ry = -screen.y / f;
      let rz = 1.0;

      if (params.distortion > 0.0) {
        let d = clamp(params.distortion, 0.0, 1.0);
        let r2 = rx * rx + ry * ry;
        let factor = 1.0 / (1.0 + d * r2 * 0.25);
        rx = rx * factor;
        ry = ry * factor;
      }

      let ray360 = normalize(vec3f(rx, ry, rz));

      let cosRoll = cos(effectiveRoll);
      let sinRoll = sin(effectiveRoll);
      let rZ = vec3f(
        ray360.x * cosRoll - ray360.y * sinRoll,
        ray360.x * sinRoll + ray360.y * cosRoll,
        ray360.z
      );

      let cosPitch = cos(pitchRad);
      let sinPitch = sin(pitchRad);
      let rX360 = vec3f(
        rZ.x,
        rZ.y * cosPitch - rZ.z * sinPitch,
        rZ.y * sinPitch + rZ.z * cosPitch
      );

      let cosYaw = cos(yawRad);
      let sinYaw = sin(yawRad);
      let rY360 = vec3f(
        rX360.x * cosYaw + rX360.z * sinYaw,
        rX360.y,
        -rX360.x * sinYaw + rX360.z * cosYaw
      );

      let w = normalize(rY360);

      let lon = atan2(w.x, w.z);
      let lat = asin(clamp(w.y, -1.0, 1.0));

      var u360 = (lon + PI) / TAU;
      u360 = fract(u360);
      let v360 = clamp((HALF_PI - lat) / PI, 0.0001, 0.9999);

      sampleUv = vec2f(u360, v360);
      inBounds = true;
    }
  }

  let color = textureSampleLevel(inputTex, texSampler, sampleUv, 0.0);
  return select(vec4f(0.0, 0.0, 0.0, 0.0), color, inBounds);
}
`

function horizonLockToNumeric(mode: HorizonLockMode | string): number {
  if (mode === '360') return 2.0
  if (mode === '45') return 1.0
  return 0.0
}

export const projection360: GpuEffectDefinition = {
  id: 'gpu-projection-360',
  name: '360° & FOV Projection',
  category: 'distort',
  entryPoint: 'projection360Fragment',
  uniformSize: 64,
  shader: PROJECTION_360_SHADER,
  params: {
    enabled: {
      type: 'boolean',
      label: 'Enable 360° Projection',
      default: true,
      animatable: false,
    },
    sourceMode: {
      type: 'select',
      label: 'Source Projection',
      default: 'ultrawide',
      options: [
        { value: 'ultrawide', label: 'UltraWide / Action Cam' },
        { value: 'spherical_360', label: '360° Spherical (Equirectangular)' },
      ],
      animatable: false,
    },
    preset: {
      type: 'select',
      label: 'FOV Preset',
      default: 'linear',
      options: [
        { value: 'ultra-wide', label: 'UltraWide' },
        { value: 'wide', label: 'Wide' },
        { value: 'linear', label: 'Linear' },
        { value: 'narrow', label: 'Narrow' },
        { value: 'horizon-45', label: '45° Horizont' },
        { value: 'horizon-360', label: '360° Horizont' },
        { value: 'custom', label: 'Libre' },
      ],
      animatable: false,
    },
    fov: {
      type: 'number',
      label: 'Field of View',
      default: DEFAULT_PROJECTION_360_SETTINGS.fov,
      min: 30,
      max: 150,
      step: 1,
      animatable: true,
    },
    distance: {
      type: 'number',
      label: 'Distance / Zoom',
      default: DEFAULT_PROJECTION_360_SETTINGS.distance,
      min: 0.5,
      max: 3.0,
      step: 0.05,
      animatable: true,
    },
    distortion: {
      type: 'number',
      label: 'Curvature / Dewarp',
      default: DEFAULT_PROJECTION_360_SETTINGS.distortion,
      min: 0,
      max: 1,
      step: 0.02,
      animatable: true,
    },
    yaw: {
      type: 'number',
      label: 'Yaw (Pan)',
      default: DEFAULT_PROJECTION_360_SETTINGS.yaw,
      min: -180,
      max: 180,
      step: 0.5,
      animatable: true,
    },
    pitch: {
      type: 'number',
      label: 'Pitch (Tilt)',
      default: DEFAULT_PROJECTION_360_SETTINGS.pitch,
      min: -90,
      max: 90,
      step: 0.5,
      animatable: true,
    },
    roll: {
      type: 'number',
      label: 'Roll',
      default: DEFAULT_PROJECTION_360_SETTINGS.roll,
      min: -180,
      max: 180,
      step: 0.5,
      animatable: true,
    },
    horizonLock: {
      type: 'select',
      label: 'Horizon Lock',
      default: 'off',
      options: [
        { value: 'off', label: 'Off' },
        { value: '45', label: '45° Horizon Lock' },
        { value: '360', label: '360° Horizon Lock' },
      ],
      animatable: false,
    },
    horizonOffset: {
      type: 'number',
      label: 'Horizon Offset',
      default: DEFAULT_PROJECTION_360_SETTINGS.horizonOffset,
      min: -45,
      max: 45,
      step: 0.5,
      animatable: true,
    },
  },
  packUniforms: (p, width, height) => {
    const isEnabled = p.enabled !== false
    const sourceMode = p.sourceMode === 'spherical_360' ? 1.0 : 0.0
    const fov = Number(p.fov ?? DEFAULT_PROJECTION_360_SETTINGS.fov)
    const distance = Number(p.distance ?? DEFAULT_PROJECTION_360_SETTINGS.distance)
    const distortion = Number(p.distortion ?? DEFAULT_PROJECTION_360_SETTINGS.distortion)
    const yaw = Number(p.yaw ?? DEFAULT_PROJECTION_360_SETTINGS.yaw)
    const pitch = Number(p.pitch ?? DEFAULT_PROJECTION_360_SETTINGS.pitch)
    const roll = Number(p.roll ?? DEFAULT_PROJECTION_360_SETTINGS.roll)
    const horizonLock = horizonLockToNumeric(p.horizonLock as string)
    const horizonOffset = Number(p.horizonOffset ?? DEFAULT_PROJECTION_360_SETTINGS.horizonOffset)
    const preset = p.preset as string | undefined
    let isDewarpMode = 0.0
    if (preset === 'ultra-wide' || preset === 'wide') {
      isDewarpMode = 0.0
    } else if (
      preset === 'linear' ||
      preset === 'narrow' ||
      preset === 'horizon-45' ||
      preset === 'horizon-360'
    ) {
      isDewarpMode = 1.0
    } else if (preset === 'custom') {
      isDewarpMode = distortion > 0.05 ? 1.0 : 0.0
    } else {
      isDewarpMode = distortion > 0.3 ? 1.0 : 0.0
    }

    return new Float32Array([
      width,
      height,
      width,
      height,
      fov,
      distance,
      distortion,
      yaw,
      pitch,
      roll,
      horizonLock,
      horizonOffset,
      isEnabled ? 1.0 : 0.0,
      sourceMode,
      isDewarpMode,
      0.0,
    ])
  },
}
