import numpy as np
from PIL import Image

# Step 1: Define camera and view plane parameters
WIDTH, HEIGHT = 400, 400
FOV = np.pi / 3  # 60 degrees in radians
CAMERA_POS = np.array([0.0, 0.0, 1.0])
LOOK_AT = np.array([0.0, 0.0, 0.0])
UP = np.array([0.0, 1.0, 0.0])

# Step 2: Define the sphere geometry and material (Phong parameters)
SPHERE_CENTER = np.array([0.0, 0.0, -3.0])
SPHERE_RADIUS = 1.0
KA = np.array([0.1, 0.1, 0.1])  # Ambient coefficient
KD = np.array([0.6, 0.2, 0.2])  # Diffuse color (red-pinkish)
KS = np.array([0.8, 0.8, 0.8])  # Specular color
SHININESS = 50  # Shininess exponent

# Light source
diffuse_light_pos = np.array([2.0, 2.0, 0.0])
light_intensity = np.array([1.0, 1.0, 1.0])  # White light
ambient_light = np.array([1.0, 1.0, 1.0])

# Step 1 (continued): Calculate camera basis vectors
def get_camera_basis():
    forward = (LOOK_AT - CAMERA_POS)
    forward = forward / np.linalg.norm(forward)
    left = np.cross(UP, forward)
    left = left / np.linalg.norm(left)
    true_up = np.cross(forward, left)
    return forward, left, true_up

forward, left, true_up = get_camera_basis()

# Step 2: Sphere class for intersection
def intersect_sphere(ray_origin, ray_dir, center, radius):
    L = center - ray_origin
    tca = np.dot(L, ray_dir)
    d2 = np.dot(L, L) - tca * tca
    r2 = radius ** 2
    if d2 > r2:
        return None
    thc = np.sqrt(r2 - d2)
    t0 = tca - thc
    t1 = tca + thc
    if t0 < 1e-4 and t1 < 1e-4:
        return None
    t = t0 if t0 > 1e-4 else t1
    hit_point = ray_origin + t * ray_dir
    normal = (hit_point - center) / radius
    return hit_point, normal, t

# Step 5: Phong lighting

def phong_illumination(point, normal, view_dir, ka, kd, ks, shininess, light_pos, light_intensity, ambient_light, shadow):
    # Ambient
    Ia = ka * ambient_light
    # Diffuse
    light_dir = light_pos - point
    light_dir = light_dir / np.linalg.norm(light_dir)
    diff = max(np.dot(normal, light_dir), 0.0)
    Id = kd * light_intensity * diff if not shadow else 0.0
    # Specular
    reflect_dir = 2 * np.dot(normal, light_dir) * normal - light_dir
    reflect_dir /= np.linalg.norm(reflect_dir)
    spec = max(np.dot(view_dir, reflect_dir), 0.0) if not shadow else 0.0
    Is = ks * light_intensity * (spec ** shininess) if not shadow else 0.0
    return Ia + Id + Is

# Step 3 & 7: Ray generation and color buffer
def render():
    aspect_ratio = WIDTH / HEIGHT
    image = np.zeros((HEIGHT, WIDTH, 3))
    scale = np.tan(FOV / 2)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # Step 3: Generate ray for each pixel
            px = (2 * (x + 0.5) / WIDTH - 1) * aspect_ratio * scale
            py = (1 - 2 * (y + 0.5) / HEIGHT) * scale
            ray_dir = px * left + py * true_up + forward
            ray_dir = ray_dir / np.linalg.norm(ray_dir)
            # Step 4: Intersection
            result = intersect_sphere(CAMERA_POS, ray_dir, SPHERE_CENTER, SPHERE_RADIUS)
            if result is None:
                image[y, x] = np.array([0.0, 0.0, 0.0])  # Black background
                continue
            hit_pt, normal, t = result
            # Step 6: Shadow
            to_light = diffuse_light_pos - hit_pt
            to_light /= np.linalg.norm(to_light)
            shadow_ray_origin = hit_pt + normal * 1e-4
            shadow_result = intersect_sphere(shadow_ray_origin, to_light, SPHERE_CENTER, SPHERE_RADIUS)
            shadow = shadow_result is not None and shadow_result[2] > 1e-4
            # Step 5: Phong shading
            view_dir = -ray_dir
            color = phong_illumination(hit_pt, normal, view_dir, KA, KD, KS, SHININESS, diffuse_light_pos, light_intensity, ambient_light, shadow)
            image[y, x] = np.clip(color, 0, 1)
    return image

# Step 8: Output the image
def main():
    img_arr = render()
    img_arr = (img_arr * 255).astype(np.uint8)
    img = Image.fromarray(img_arr, mode='RGB')
    img.save('phong_sphere.png')
    img.show()

if __name__ == '__main__':
    main()
