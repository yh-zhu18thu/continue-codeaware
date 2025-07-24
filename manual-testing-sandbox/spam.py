import pandas as pd

# Step s-1: Read in the labeled CSV file
def read_labeled_data(file_path):
    """
    Reads labeled data from the specified CSV file.

    :param file_path: Path to the CSV file with spam data.
    :return: Pandas DataFrame containing the data.
    """
    try:
        # Read the CSV file into a Pandas DataFrame
        data = pd.read_csv(file_path) 
        
        # Ensure data structure and columns exist (e.g., 'text' and 'label' columns)
        if 'text' in data.columns and 'label' in data.columns:
            return data
        else:
            raise ValueError("Required columns 'text' and 'label' are missing from the dataset.")
    except Exception as e:
        print(f"Error reading the file: {e}")
        return None

# Usage example (path adjusted for the step requirement):
labeled_data = read_labeled_data('src/spam.csv')
if labeled_data is not None:
    print(labeled_data.head())  # Print the first few rows for verification