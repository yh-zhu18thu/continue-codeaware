import numpy as np
from PIL import Image

# 定义向量和相关操作
class Vec3:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z
    def __add__(self, other):
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)
    def __sub__(self, other):
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)
    def __mul__(self, scalar):
        if isinstance(scalar, Vec3):
            return Vec3(self.x * scalar.x, self.y * scalar.y, self.z * scalar.z)
        return Vec3(self.x * scalar, self.y * scalar, self.z * scalar)
    def __rmul__(self, scalar):
        return self.__mul__(scalar)
    def dot(self, other):
        return self.x*other.x + self.y*other.y + self.z*other.z
    def norm(self):
        return np.sqrt(self.dot(self))
    def normalize(self):
        n = self.norm()
        if n == 0:
            return self
        return self * (1.0 / n)
    def reflect(self, n):
        return self - n * (2*self.dot(n))
    def to_list(self):
        return [self.x, self.y, self.z]

# 材质
class Material:
    def __init__(self, color, ambient=0.05, diffuse=1.0, specular=1.0, shininess=50):
        self.color = color
        self.ambient = ambient
        self.diffuse = diffuse
        self.specular = specular
        self.shininess = shininess

# 光源
class Light:
    def __init__(self, position, intensity):
        self.position = position
        self.intensity = intensity  # Vec3 (r,g,b)

# 球体
class Sphere:
    def __init__(self, center, radius, material):
        self.center = center
        self.radius = radius
        self.material = material
    def intersect(self, ray_orig, ray_dir):
        oc = ray_orig - self.center
        a = ray_dir.dot(ray_dir)
        b = 2.0 * oc.dot(ray_dir)
        c = oc.dot(oc) - self.radius * self.radius
        discriminant = b*b - 4*a*c
        if discriminant < 0:
            return None
        sqrt_dis = np.sqrt(discriminant)
        t1 = (-b - sqrt_dis) / (2*a)
        t2 = (-b + sqrt_dis) / (2*a)
        if t1 > 1e-4:
            return t1
        if t2 > 1e-4:
            return t2
        return None
    def normal_at(self, p):
        return (p - self.center).normalize()

# 平面
class Plane:
    def __init__(self, point, normal, material):
        self.point = point
        self.normal = normal.normalize()
        self.material = material
    def intersect(self, ray_orig, ray_dir):
        denom = ray_dir.dot(self.normal)
        if np.abs(denom) < 1e-6:
            return None
        t = (self.point - ray_orig).dot(self.normal) / denom
        return t if t > 1e-4 else None
    def normal_at(self, p):
        return self.normal

# 相机和视口参数
def generate_ray(i, j, width, height, fov, cam_pos):
    aspect_ratio = width / height
    x = (2 * (i + 0.5) / width - 1) * np.tan(fov/2*np.pi/180) * aspect_ratio
    y = (1 - 2 * (j + 0.5) / height) * np.tan(fov/2*np.pi/180)
    dir_vec = Vec3(x, y, -1).normalize()
    return cam_pos, dir_vec

# 判断射线最近交点
def closest_intersection(ray_orig, ray_dir, objects):
    closest_t = float('inf')
    hit_obj = None
    for obj in objects:
        t = obj.intersect(ray_orig, ray_dir)
        if t is not None and t < closest_t:
            closest_t = t
            hit_obj = obj
    if hit_obj is not None:
        hit_pos = ray_orig + ray_dir * closest_t
        hit_normal = hit_obj.normal_at(hit_pos)
        return hit_obj, hit_pos, hit_normal, closest_t
    return None, None, None, None

# 计算Phong光照

def phong_lighting(hit_pos, normal, view_dir, material, lights, objects):
    color = material.color * material.ambient
    for light in lights:
        to_light = (light.position - hit_pos).normalize()
        # Shadow
        shadow_orig = hit_pos + normal * 1e-5
        shadow_obj, *_ = closest_intersection(shadow_orig, to_light, objects)
        in_light = True
        if shadow_obj is not None:
            l_dist = (light.position - hit_pos).norm()
            test_dist = ((shadow_orig + to_light * _[2]) - shadow_orig).norm()
            if (test_dist < l_dist):
                in_light = False
        if in_light:
            # Diffuse
            diff = max(normal.dot(to_light), 0)
            # Specular
            reflect_dir = to_light.reflect(normal)
            spec = max(reflect_dir.dot(view_dir), 0) ** material.shininess
            color += material.color * light.intensity * material.diffuse * diff
            color += light.intensity * material.specular * spec
    return vmin_vmax_vec3(color, 0, 1)

def vmin_vmax_vec3(vec, vmin, vmax):
    return Vec3(*[np.clip(c, vmin, vmax) for c in vec.to_list()])

def render(width=400, height=300):
    camera_pos = Vec3(0, 0, 1.2)
    fov = 60
    # 材质与对象配置
    red = Material(Vec3(1,0.2,0.2), ambient=0.15, diffuse=0.7, specular=0.3, shininess=64)
    green = Material(Vec3(0.2,1,0.2), ambient=0.1, diffuse=0.8, specular=0.2, shininess=32)
    blue = Material(Vec3(0.2,0.2,1), ambient=0.1, diffuse=0.5, specular=0.5, shininess=32)
    gray = Material(Vec3(0.7,0.7,0.7), ambient=0.12, diffuse=0.6, specular=0.2, shininess=8)
    spheres = [
        Sphere(Vec3(0.3, 0, -1.2), 0.38, red),
        Sphere(Vec3(-0.45, -0.13, -1.0), 0.30, green),
        Sphere(Vec3(-0.05, 0.62, -1.5), 0.24, blue),
    ]
    planes = [
        Plane(Vec3(0,-0.5,-1), Vec3(0,1,0), gray)
    ]
    objects = spheres + planes
    # 光源
    lights = [
        Light(Vec3(2,2,0.7), Vec3(1,1,1))
    ]
    img_arr = np.zeros((height, width, 3))
    for j in range(height):
        for i in range(width):
            ray_orig, ray_dir = generate_ray(i, j, width, height, fov, camera_pos)
            hit_obj, hit_pos, normal, _ = closest_intersection(ray_orig, ray_dir, objects)
            if hit_obj is None:
                img_arr[j, i] = [0.07, 0.11, 0.19]  # 背景色
            else:
                view_dir = -ray_dir
                color = phong_lighting(hit_pos, normal, view_dir, hit_obj.material, lights, objects)
                img_arr[j, i] = color.to_list()
    img_arr = (np.clip(img_arr, 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(img_arr, 'RGB')
    img.save('phong_result.png')
    print('Saved to phong_result.png')

if __name__ == '__main__':
    render()
