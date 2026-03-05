UI:

create an electron app that allows user to have multiple(>100) monaco editors openning. all monica editors are open and layout in horizontal one by one. user can horizontal scroll bar to drag and move and scroll the row of monaco editors. also you need to provide a tab bar. when user click a tab, the UI should jump to the monaco editor. also you need to provide a button to create new tab. also you need to allow user to an

Project Manager:

Each project exists in a folder. 

Get specs from Github repo:

1. Create a new folder in a temporary directory.
2. Clone the Github repo into that folder.
3. Get the summarizeSpecs string, create a new file named "summarize_specs_instructions.md" in the root of the cloned repo, and write the summarizeSpecs string into that file.
4. Create a terminal process in this temporary directory and run the command 

claude --dangerously-skip-permissions -p "Please read the summarize_specs_instructions.md file and create a new file output_specs.md to save all outputs"

to print the summarizeSpecs string in the terminal.
5. After the command finishes, read the content of "output_specs.md" from the root of temp directory and return it as the output of this function, and shows in a textbox.


Project management:

1. The left panel is the file explorer, which shows the file structure of the project. User can select a folder to open the project.

2. Each project contains a few specs documents and corresponding implementation folder, including all codes and resources. User can click the specs document to read the specifications, and click the implementation folder to read the code. Here is the file structure of the project:

specs_v0001.md
specs_v0002.md
specs_v0003.md
...
code_v0001/
code_v0002/
code_v0003/
...

3. The right panel is the monaco editor panel, which shows the content of the selected file. User can edit the file in the monaco editor, and save the changes.

4. The top panel is the tab bar, which shows the opened files. User can click the tab to switch between different files. User can also click the "+" button to open a new file in a new tab.

5. When create a