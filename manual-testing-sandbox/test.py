# 我希望写一个打地鼠游戏

# Step 1: Importing pygame and initializing the environment
import pygame  # Import the pygame library
import sys     # Import sys to handle exiting the program

# Initialize Pygame
pygame.init()

# Step 2: Define game constants
# Configure the screen size and other constants
screen_width, screen_height = 800, 600  # Screen dimensions
background_color = (255, 255, 255)  # White background color
fps = 60  # Frames per second frame rate definition

# Set up the screen
screen = pygame.display.set_mode((screen_width, screen_height))
pygame.display.set_caption('Whack-A-Mole')  # Set the window title

# Create a clock object to control the frame rate
clock = pygame.time.Clock()

# Step 2: Main game loop
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:  # Check for window close event
            running = False

    # Fill the background color
    screen.fill(background_color)

    # Refresh the display
    pygame.display.flip()

    # Control the frame rate
    clock.tick(fps)  # Limit the while loop to the defined fps

# Quit the game properly
pygame.quit()
sys.exit()