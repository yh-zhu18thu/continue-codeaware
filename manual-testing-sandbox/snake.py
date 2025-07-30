import pygame

# Step 1: Install and test pygame library
# No code required for installation - see the bash command `pip install pygame`
# Step 2: Create a game window and set its background color
# Initialize the pygame module
pygame.init()

# Define window dimensions
window_width, window_height = 800, 600

# Initialize the game window with the defined dimensions
screen = pygame.display.set_mode((window_width, window_height))

# Set a background color (light blue) using an RGB tuple
background_color = (135, 206, 250)  # RGB values for light blue
screen.fill(background_color)


# Update the display to render the background color
pygame.display.update()

# Optional: Keep the window open temporarily
pygame.time.wait(2000)

# Quit pygame properly
pygame.quit()