import math
from dataclasses import dataclass
from typing import Optional, Tuple, List
import numpy as np
from PIL import Image

# Vector class for 3D math
def vec3(x, y, z):
    return np.array([x, y, z], dtype=np.float32)

def normalize(v):
    n = np.linalg.norm(v)
    return v / n if n > 0 else v

def reflect(v, n):
    return v - 2 * np.dot(v, n) * n

def refract(v, n, ior):
    cosi = -max(-1.0, min(1.0, np.dot(v, n)))
    etai = 1.0
    etat = ior
    if cosi < 0:
        cosi = -cosi
        n = -n
        etai, etat = etat, etai
    eta = etai / etat
    k = 1.0 - eta * eta * (1.0 - cosi * cosi)
    return eta * v + (eta * cosi - math.sqrt(k)) * n if k > 0 else None

@dataclass
class Material:
    color: np.ndarray
    albedo: Tuple[float, float, float, float]  # diffuse, specular, reflection, refraction
    specular_exponent: float
    refractive_index: float = 1.0

@dataclass
class Ray:
    origin: np.ndarray
    direction: np.ndarray

@dataclass
class Sphere:
    center: np.ndarray
    radius: float
    material: Material

    def intersect(self, ray: Ray) -> Optional[Tuple[float, np.ndarray]]:
        L = self.center - ray.origin
        tca = np.dot(L, ray.direction)
        d2 = np.dot(L, L) - tca * tca
        if d2 > self.radius * self.radius:
            return None
        thc = math.sqrt(self.radius * self.radius - d2)
        t0 = tca - thc
        t1 = tca + thc
        t = min(t0, t1)
        if t < 0:
            t = max(t0, t1)
        if t < 0:
            return None
        hit = ray.origin + ray.direction * t
        normal = normalize(hit - self.center)
        return t, normal

@dataclass
class Plane:
    point: np.ndarray
    normal: np.ndarray
    material: Material

    def intersect(self, ray: Ray) -> Optional[Tuple[float, np.ndarray]]:
        denom = np.dot(self.normal, ray.direction)
        if abs(denom) < 1e-6:
            return None
        t = np.dot(self.point - ray.origin, self.normal) / denom
        if t < 0:
            return None
        hit = ray.origin + ray.direction * t
        return t, self.normal

@dataclass
class Light:
    position: np.ndarray
    intensity: float

# Scene definition (Step 1 & 2)
def get_scene():
    ivory = Material(color=vec3(0.4, 0.4, 0.3), albedo=(0.6, 0.3, 0.1, 0.0), specular_exponent=50.0, refractive_index=1.0)
    red_rubber = Material(color=vec3(0.3, 0.1, 0.1), albedo=(0.9, 0.1, 0.0, 0.0), specular_exponent=10.0, refractive_index=1.0)
    mirror = Material(color=vec3(1.0, 1.0, 1.0), albedo=(0.0, 10.0, 0.8, 0.0), specular_exponent=1425.0, refractive_index=1.0)
    glass = Material(color=vec3(0.6, 0.7, 0.8), albedo=(0.0, 0.5, 0.1, 0.8), specular_exponent=125.0, refractive_index=1.5)

    objects = [
        Sphere(center=vec3(-3, 0, -16), radius=2, material=ivory),
        Sphere(center=vec3(-1.0, -1.5, -12), radius=2, material=glass),
        Sphere(center=vec3(1.5, -0.5, -18), radius=3, material=red_rubber),
        Sphere(center=vec3(7, 5, -18), radius=4, material=mirror),
        Plane(point=vec3(0, -4, 0), normal=vec3(0, 1, 0), material=Material(color=vec3(0.3, 0.3, 0.3), albedo=(1.0, 0.0, 0.0, 0.0), specular_exponent=1.0)),
    ]
    lights = [
        Light(position=vec3(-20, 20,  20), intensity=1.5),
        Light(position=vec3( 30, 50, -25), intensity=1.8),
        Light(position=vec3( 30, 20,  30), intensity=1.7),
    ]
    return objects, lights

# Camera setup (Step 3)
def render():
    width = 800
    height = 600
    fov = math.pi / 2
    camera_origin = vec3(0, 0, 0)
    image = np.zeros((height, width, 3), dtype=np.float32)
    objects, lights = get_scene()
    for j in range(height):
        for i in range(width):
            x = (2 * (i + 0.5) / width - 1) * math.tan(fov / 2) * width / height
            y = -(2 * (j + 0.5) / height - 1) * math.tan(fov / 2)
            direction = normalize(vec3(x, y, -1))
            image[j, i, :] = cast_ray(Ray(camera_origin, direction), objects, lights, depth=4)
    result = np.clip(image, 0, 1) * 255
    img = Image.fromarray(result.astype(np.uint8), 'RGB')
    img.save('output.png')
    print('Image saved as output.png')

# Ray tracing / intersection (Step 4-7)
def scene_intersect(ray: Ray, objects) -> Optional[Tuple[np.ndarray, np.ndarray, Material, float]]:
    min_dist = float('inf')
    hit_mat = None
    hit_normal = None
    hit_point = None
    for obj in objects:
        res = obj.intersect(ray)
        if res is not None:
            dist, normal = res
            if dist < min_dist:
                min_dist = dist
                hit_mat = obj.material
                hit_normal = normal
                hit_point = ray.origin + ray.direction * dist
    if hit_mat is None:
        return None
    return hit_point, hit_normal, hit_mat, min_dist

def cast_ray(ray: Ray, objects, lights, depth: int) -> np.ndarray:
    if depth == 0:
        return vec3(0.2, 0.7, 0.8)  # background color
    result = scene_intersect(ray, objects)
    if not result:
        return vec3(0.2, 0.7, 0.8)
    point, normal, material, _ = result
    reflect_dir = normalize(reflect(ray.direction, normal))
    refract_dir = refract(ray.direction, normal, material.refractive_index)
    reflect_origin = point + normal * 1e-3 if np.dot(reflect_dir, normal) > 0 else point - normal * 1e-3
    refract_origin = point - normal * 1e-3 if refract_dir is not None and np.dot(refract_dir, normal) < 0 else point + normal * 1e-3
    reflect_color = cast_ray(Ray(reflect_origin, reflect_dir), objects, lights, depth - 1) if material.albedo[2] > 0 else vec3(0,0,0)
    refract_color = cast_ray(Ray(refract_origin, refract_dir), objects, lights, depth - 1) if refract_dir is not None and material.albedo[3] > 0 else vec3(0,0,0)

    diffuse_light_intensity = 0.0
    specular_light_intensity = 0.0
    for light in lights:
        light_dir = normalize(light.position - point)
        # Shadow check
        shadow_origin = point + normal * 1e-3 if np.dot(light_dir, normal) > 0 else point - normal * 1e-3
        shadow_ray = Ray(shadow_origin, light_dir)
        shadow_res = scene_intersect(shadow_ray, objects)
        if shadow_res:
            shadow_point, _, _, shadow_dist = shadow_res
            if np.linalg.norm(light.position - point) - np.linalg.norm(shadow_point - point) > 1e-2:
                continue  # in shadow
        diffuse_light_intensity += light.intensity * max(0.0, np.dot(light_dir, normal))
        reflect_light = reflect(-light_dir, normal)
        specular_light_intensity += light.intensity * (max(0.0, np.dot(reflect_light, ray.direction)) ** material.specular_exponent)
    color = (
        material.color * diffuse_light_intensity * material.albedo[0] +
        vec3(1,1,1) * specular_light_intensity * material.albedo[1] +
        reflect_color * material.albedo[2] +
        refract_color * material.albedo[3]
    )
    return color

if __name__ == "__main__":
    render()
