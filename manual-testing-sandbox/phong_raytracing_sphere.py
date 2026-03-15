import numpy as np
from PIL import Image

# Step 1: 定义摄像机和视窗参数
class Camera:
    def __init__(self, position, look_at, up, fov, aspect_ratio, width, height):
        self.position = np.array(position, dtype=np.float32)
        self.look_at = np.array(look_at)
        self.up = np.array(up)
        self.fov = fov
        self.aspect_ratio = aspect_ratio
        self.width = width
        self.height = height
        self._setup()
    def _setup(self):
        self.forward = (self.look_at - self.position)
        self.forward = self.forward / np.linalg.norm(self.forward)
        self.right = np.cross(self.forward, self.up)
        self.right = self.right / np.linalg.norm(self.right)
        self.up = np.cross(self.right, self.forward)
        half_height = np.tan(np.deg2rad(self.fov/2))
        half_width = self.aspect_ratio * half_height
        self.screen_center = self.position + self.forward
        self.screen_x = self.right * half_width
        self.screen_y = self.up * half_height
    def get_ray(self, x, y):
        # x, y in [0, width/height)
        u = (2*(x + 0.5)/self.width - 1)
        v = (1 - 2*(y + 0.5)/self.height)
        pixel_dir = self.forward + u*self.screen_x + v*self.screen_y
        pixel_dir = pixel_dir / np.linalg.norm(pixel_dir)
        return self.position, pixel_dir

# Step 2: 建立球体与光源对象
class Sphere:
    def __init__(self, center, radius, color, ka, kd, ks, shininess):
        self.center = np.array(center)
        self.radius = radius
        self.color = np.array(color)
        self.ka = ka # 环境光反射系数
        self.kd = kd # 漫反射系数
        self.ks = ks # 镜面反射系数
        self.shininess = shininess
    def intersect(self, ray_origin, ray_dir):
        # Return nearest t and normal if hit, else None
        oc = ray_origin - self.center
        a = np.dot(ray_dir, ray_dir)
        b = 2.0 * np.dot(oc, ray_dir)
        c = np.dot(oc, oc) - self.radius*self.radius
        discriminant = b*b - 4*a*c
        if discriminant < 0:
            return None
        sqrt_dis = np.sqrt(discriminant)
        t1 = (-b - sqrt_dis) / (2*a)
        t2 = (-b + sqrt_dis) / (2*a)
        if t1 > 1e-4:
            t = t1
        elif t2 > 1e-4:
            t = t2
        else:
            return None
        hit_pos = ray_origin + t*ray_dir
        normal = (hit_pos - self.center) / self.radius
        return t, hit_pos, normal

class Light:
    def __init__(self, position, intensity):
        self.position = np.array(position)
        self.intensity = np.array(intensity)

# Step 3: 生成视线方向光线、Step 4: 检测射线与球体交点、Step 5: 计算Phong分量
# Step 6: 合成最终像素颜色、Step 7: 绘制每个像素颜色到画布
WIDTH = 400
HEIGHT = 400
aspect_ratio = WIDTH / HEIGHT

camera = Camera(position=[0,0,1], look_at=[0,0,0], up=[0,1,0], 
                fov=45, aspect_ratio=aspect_ratio, width=WIDTH, height=HEIGHT)

sphere = Sphere(center=[0,0,0], radius=0.5, color=[1, 0.3, 0.1], 
                ka=0.1, kd=0.7, ks=0.6, shininess=32)

light = Light(position=[2,2,2], intensity=[1,1,1])
background_color = np.array([0.06, 0.08, 0.12])

scene_ambient = 0.2
img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)

for y in range(HEIGHT):
    for x in range(WIDTH):
        ray_origin, ray_dir = camera.get_ray(x, y)
        res = sphere.intersect(ray_origin, ray_dir)
        if res is None:
            img[y,x] = background_color
            continue
        t, pos, normal = res
        # 环境光
        ambient = sphere.ka * scene_ambient * sphere.color
        # 漫反射
        to_light = light.position - pos
        to_light_norm = np.linalg.norm(to_light)
        to_light_dir = to_light / to_light_norm
        # 判断阴影（若需要可扩展）
        diff_intensity = max(np.dot(normal, to_light_dir), 0)
        diffuse = sphere.kd * diff_intensity * sphere.color * light.intensity / (to_light_norm ** 2)
        # 镜面反射
        view_dir = camera.position - pos
        view_dir = view_dir / np.linalg.norm(view_dir)
        reflect_dir = 2*np.dot(normal, to_light_dir)*normal - to_light_dir
        spec_intensity = max(np.dot(view_dir, reflect_dir), 0) ** sphere.shininess
        specular = sphere.ks * spec_intensity * light.intensity / (to_light_norm ** 2)
        # 合成
        color = ambient + diffuse + specular
        color = np.clip(color, 0, 1)
        img[y, x] = color

# Step 8: 保存或显示渲染图像
img_out = (img * 255).astype(np.uint8)
image = Image.fromarray(img_out, 'RGB')
image.save('phong_raytracing_sphere.png')
image.show()
