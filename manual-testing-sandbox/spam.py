# Import necessary Python libraries and packages
import pandas as pd  # For data loading and manipulation
import numpy as np    # For numerical operations

# Step 2: Load the spam message dataset from CSV
# The CSV file should be in the same directory or provide the correct path
spam_df = pd.read_csv('spam.csv', encoding='latin-1')  # encoding to handle possible non-UTF8 chars

# Step 3: Explore and inspect the loaded dataset
print("Dataset shape:", spam_df.shape)                # Number of rows and columns
print("Column names:", spam_df.columns.tolist())        # List of column names
print("Sample rows:")
print(spam_df.head(5))                                 # Display first 5 rows

# Step 4: Handle missing data and duplicates
print("\nChecking for missing values:")
print(spam_df.isnull().sum())                           # Count missing values per column
spam_df = spam_df.dropna()                              # Remove rows with missing values if any
print("\nChecking for duplicate rows:")
num_duplicates = spam_df.duplicated().sum()
print(f"Found {num_duplicates} duplicate rows.")
spam_df = spam_df.drop_duplicates()                     # Remove duplicate rows

# Step 5: Map text labels to binary numerical values
# Convert 'v1' column: 'spam' -> 1, 'ham' -> 0
spam_df['label_num'] = spam_df['v1'].map({'ham': 0, 'spam': 1})
print("\nValue counts for mapped labels:")
print(spam_df['label_num'].value_counts())
