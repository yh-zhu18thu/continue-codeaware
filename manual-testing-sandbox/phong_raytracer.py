import numpy as np
from PIL import Image

# 1. 定义几何体的数据结构
class Material:
    def __init__(self, ambient, diffuse, specular, shininess):
        self.ambient = np.array(ambient)
        self.diffuse = np.array(diffuse)
        self.specular = np.array(specular)
        self.shininess = shininess

class Sphere:
    def __init__(self, center, radius, material):
        self.center = np.array(center)
        self.radius = radius
        self.material = material

    def intersect(self, orig, dir):
        L = self.center - orig
        tca = np.dot(L, dir)
        d2 = np.dot(L, L) - tca * tca
        if d2 > self.radius * self.radius:
            return None
        thc = np.sqrt(self.radius * self.radius - d2)
        t0 = tca - thc
        t1 = tca + thc
        if t0 < 1e-4 and t1 < 1e-4:
            return None
        t = t0 if t0 > 1e-4 else t1
        hit_point = orig + t * dir
        normal = (hit_point - self.center) / self.radius
        return t, hit_point, normal, self.material

class Plane:
    def __init__(self, point, normal, material):
        self.point = np.array(point)
        self.normal = np.array(normal) / np.linalg.norm(normal)
        self.material = material

    def intersect(self, orig, dir):
        denom = np.dot(self.normal, dir)
        if np.abs(denom) < 1e-6:
            return None
        t = np.dot(self.point - orig, self.normal) / denom
        if t < 1e-4:
            return None
        hit_point = orig + t * dir
        return t, hit_point, self.normal, self.material

# 2. 配置光源和相机参数
class Light:
    def __init__(self, position, color, intensity):
        self.position = np.array(position)
        self.color = np.array(color)
        self.intensity = intensity

class Camera:
    def __init__(self, eye, center, up, fov, aspect):
        self.eye = np.array(eye)
        self.center = np.array(center)
        self.up = np.array(up)
        self.fov = fov
        self.aspect = aspect
        
        self._setup()

    def _setup(self):
        w = (self.eye - self.center)
        w = w / np.linalg.norm(w)
        u = np.cross(self.up, w)
        u = u / np.linalg.norm(u)
        v = np.cross(w, u)
        self.u = u
        self.v = v
        self.w = w

    def get_ray(self, x, y, width, height):
        # 3. 解析像素到射线的映射关系
        px = (2 * ((x + 0.5) / width) - 1) * np.tan(self.fov / 2) * self.aspect
        py = (1 - 2 * ((y + 0.5) / height)) * np.tan(self.fov / 2)
        dir = px * self.u + py * self.v - self.w
        dir = dir / np.linalg.norm(dir)
        return self.eye, dir

# 4. 射线与物体的交点检测函数
def find_nearest(objects, orig, dir):
    min_t = np.inf
    hit = None
    for obj in objects:
        res = obj.intersect(orig, dir)
        if res is not None:
            t, hit_point, normal, material = res
            if 1e-4 < t < min_t:
                min_t = t
                hit = (hit_point, normal, material)
    return hit

# 5. 计算Phong局部光照贡献
def phong_shading(point, normal, view_dir, material, lights, objects, ambient_light):
    # 环境光
    color = material.ambient * ambient_light
    for light in lights:
        light_dir = light.position - point
        light_dir = light_dir / np.linalg.norm(light_dir)

        # Shadow check
        shadow_orig = point + normal * 1e-4
        shadow_hit = find_nearest(objects, shadow_orig, light_dir)
        if shadow_hit is not None:
            continue  # 被阴影遮挡

        # 漫反射
        diff = max(np.dot(normal, light_dir), 0)
        diffuse = material.diffuse * light.color * light.intensity * diff

        # 镜面反射
        reflect_dir = 2 * np.dot(normal, light_dir) * normal - light_dir
        reflect_dir = reflect_dir / np.linalg.norm(reflect_dir)
        spec = max(np.dot(view_dir, reflect_dir), 0) ** material.shininess
        specular = material.specular * light.color * light.intensity * spec

        color += diffuse + specular
    color = np.clip(color, 0, 1)
    return (color * 255).astype(np.uint8)

# 6. 合成输出
if __name__ == "__main__":
    width = 400
    height = 300
    aspect = width / height
    fov = np.radians(60)
    
    # 材质
    red = Material([.1,0,0], [.7,0,0], [1,1,1], 50)
    green = Material([0,.1,0], [0,.7,0], [1,1,1], 50)
    blue = Material([0,0,.1], [0,0,.7], [1,1,1], 100)
    gray = Material([.1,.1,.1], [.7,.7,.7], [1,1,1], 10)

    # 场景几何
    objects = [
        Sphere([0, 0, -3], 1, red),
        Sphere([2, 0, -4], 1, green),
        Sphere([-2, 0, -4], 1, blue),
        Plane([0, -1, 0], [0, 1, 0], gray)
    ]
    # 光源
    lights = [
        Light([5, 5, 0], [1, 1, 1], 0.7),
        Light([-3, 5, -2], [1, 1, 1], 0.3)
    ]
    ambient_light = 0.2

    # 相机
    camera = Camera(
        eye=[0, 1, 2],
        center=[0, 0, -3],
        up=[0, 1, 0],
        fov=fov, aspect=aspect
    )

    img = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        for x in range(width):
            orig, dir = camera.get_ray(x, y, width, height)
            hit = find_nearest(objects, orig, dir)
            if hit is not None:
                hit_point, normal, material = hit
                view_dir = -dir
                color = phong_shading(hit_point, normal, view_dir, material, lights, objects, ambient_light)
                img[y, x] = color
            else:
                img[y, x] = [30, 30, 30]
    Image.fromarray(img).save('phong_render.png')
    print('Render saved as phong_render.png.')
