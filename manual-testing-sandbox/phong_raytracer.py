import numpy as np
from PIL import Image

# ====== Step 1: 定义几何体与光源属性 ======

class Material:
    def __init__(self, color, ambient=0.1, diffuse=0.6, specular=0.3, shininess=32):
        self.color = np.array(color)
        self.ambient = ambient
        self.diffuse = diffuse
        self.specular = specular
        self.shininess = shininess

class Sphere:
    def __init__(self, center, radius, material):
        self.center = np.array(center)
        self.radius = radius
        self.material = material

    def intersect(self, ray_origin, ray_dir):
        # Ray-sphere intersection: |(o + td) - c|^2 = r^2
        oc = ray_origin - self.center
        a = np.dot(ray_dir, ray_dir)
        b = 2.0 * np.dot(oc, ray_dir)
        c = np.dot(oc, oc) - self.radius ** 2
        discriminant = b * b - 4 * a * c
        if discriminant < 0:
            return None
        sqrt_disc = np.sqrt(discriminant)
        t1 = (-b - sqrt_disc) / (2 * a)
        t2 = (-b + sqrt_disc) / (2 * a)
        t = min(t1, t2)
        if t < 0:
            t = max(t1, t2)
        if t < 0:
            return None
        hit_pos = ray_origin + t * ray_dir
        normal = (hit_pos - self.center) / self.radius
        return t, hit_pos, normal, self.material

class Light:
    def __init__(self, position, intensity, color=(1, 1, 1)):
        self.position = np.array(position)
        self.intensity = intensity
        self.color = np.array(color)

# ====== Step 2: 建立摄像机与视窗模型 ======

def get_camera_rays(width, height, fov, origin, look_at):
    aspect = width / height
    theta = np.deg2rad(fov)
    half_height = np.tan(theta / 2)
    half_width = aspect * half_height
    w = (origin - look_at)
    w /= np.linalg.norm(w)
    up = np.array([0, 1, 0])
    u = np.cross(up, w)
    u /= np.linalg.norm(u)
    v = np.cross(w, u)
    # Create a viewport basis
    lower_left = origin - half_width*u - half_height*v - w
    horizontal = 2*half_width*u
    vertical = 2*half_height*v
    return lower_left, horizontal, vertical

# ====== Step 3,4,5,6: Ray tracing with Phong and shadow/material integration ======

def reflect(I, N):
    return I - 2 * np.dot(I, N) * N

def trace_ray(ray_origin, ray_dir, objects, lights, depth, max_depth):
    if depth > max_depth:
        return np.zeros(3)
    # Find nearest intersection
    min_t = float('inf')
    hit_data = None
    for obj in objects:
        result = obj.intersect(ray_origin, ray_dir)
        if result:
            t, pos, normal, material = result
            if t < min_t and t > 1e-4:
                min_t = t
                hit_data = (pos, normal, material)
    if hit_data is None:
        return np.zeros(3)
    hit_pos, normal, material = hit_data
    # ====== Step 5: Phong shading ======
    color = np.zeros(3)
    view_dir = -ray_dir
    for light in lights:
        # Shadow check (Step 6)
        light_dir = light.position - hit_pos
        light_dist = np.linalg.norm(light_dir)
        light_dir /= light_dist
        shadow = False
        for obj in objects:
            result = obj.intersect(hit_pos + 1e-4 * normal, light_dir)
            if result and result[0] < light_dist:
                shadow = True
                break
        if not shadow:
            # Ambient
            ambient = material.ambient * material.color * light.intensity * light.color
            color += ambient
            # Diffuse
            diff = max(np.dot(normal, light_dir), 0.0)
            diffuse = material.diffuse * diff * material.color * light.intensity * light.color
            color += diffuse
            # Specular
            reflect_dir = reflect(-light_dir, normal)
            spec = max(np.dot(view_dir, reflect_dir), 0.0) ** material.shininess
            specular = material.specular * spec * light.intensity * light.color
            color += specular
        else:
            # Add only ambient if in shadow
            ambient = material.ambient * material.color * light.intensity * light.color
            color += ambient
    # Reflection (Step 4/6)
    if material.specular > 0 and depth < max_depth:
        reflect_dir = reflect(ray_dir, normal)
        reflection = trace_ray(hit_pos + 1e-4 * normal, reflect_dir, objects, lights, depth + 1, max_depth)
        color = color * (1 - material.specular) + material.specular * reflection
    color = np.clip(color, 0, 1)
    return color

def render(scene, width=400, height=300, fov=60, max_depth=3):
    camera_pos = np.array([0, 0, 1])
    look_at = np.array([0, 0, 0])
    lower_left, horizontal, vertical = get_camera_rays(width, height, fov, camera_pos, look_at)
    image = np.zeros((height, width, 3))
    for j in range(height):
        for i in range(width):
            u = i / (width - 1)
            v = (height - 1 - j) / (height - 1)
            pixel_pos = lower_left + u * horizontal + v * vertical
            ray_dir = pixel_pos - camera_pos
            ray_dir /= np.linalg.norm(ray_dir)
            color = trace_ray(camera_pos, ray_dir, scene['objects'], scene['lights'], 0, max_depth)
            image[j, i, :] = color
    return image

if __name__ == '__main__':
    # 定义材质和物体（Step 1）
    red = Material(color=[1, 0.2, 0.2], specular=0.5, shininess=64)
    green = Material(color=[0.2, 1, 0.2], specular=0.8, shininess=128)
    blue = Material(color=[0.2, 0.2, 1], specular=0.3, shininess=16)
    ground = Material(color=[0.9, 0.85, 0.8], specular=0.0)
    
    objects = [
        Sphere(center=[0, 0, -1], radius=0.5, material=red),
        Sphere(center=[1.2, 0.1, -1.5], radius=0.4, material=green),
        Sphere(center=[-1.1, -0.22, -1.2], radius=0.6, material=blue),
        Sphere(center=[0, -100.5, -1], radius=100, material=ground)
    ]
    lights = [
        Light(position=[2, 2, 2], intensity=1.3),
        Light(position=[-2, 1.5, 0], intensity=0.5, color=(0.8, 0.8, 1.0))
    ]
    scene = {'objects': objects, 'lights': lights}
    # 渲染（Steps 2-6）
    w, h = 400, 300
    img = render(scene, w, h, fov=60, max_depth=3)
    img = (img * 255).astype(np.uint8)
    im = Image.fromarray(img)
    im.save('phong_raytraced.png')
