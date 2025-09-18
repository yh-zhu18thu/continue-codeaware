# Import necessary packages
import pandas as pd  # For data handling
from sklearn.model_selection import train_test_split  # For splitting the dataset
from sklearn.feature_extraction.text import TfidfVectorizer  # For converting text to numerical features

# Read the dataset from file
data = pd.read_csv('spam.csv', encoding='latin-1')  # Load the spam.csv file

# Extract relevant columns ('v1' as label, 'v2' as message)
data = data[['v1', 'v2']]

# Split data into training and testing sets
X = data['v2']  # Message texts
y = data['v1']  # Labels (spam/ham)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Convert text data to numerical features using TF-IDF vectorization
vectorizer = TfidfVectorizer()
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)
